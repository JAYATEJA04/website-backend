const chai = require("chai");
const { expect } = chai;
const chaiHttp = require("chai-http");

const firestore = require("../../utils/firestore");
const app = require("../../server");
const authService = require("../../services/authService");
const addUser = require("../utils/addUser");
const profileDiffs = require("../../models/profileDiffs");
const cleanDb = require("../utils/cleanDb");
// Import fixtures
const userData = require("../fixtures/user/user")();
const profileDiffData = require("../fixtures/profileDiffs/profileDiffs")();
const superUser = userData[4];
const searchParamValues = require("../fixtures/user/search")();

const config = require("config");
const { getDiscordMembers } = require("../fixtures/discordResponse/discord-response");
const joinData = require("../fixtures/user/join");
const {
  userStatusDataAfterSignup,
  userStatusDataAfterFillingJoinSection,
} = require("../fixtures/userStatus/userStatus");
const { addJoinData, addOrUpdate } = require("../../models/users");
const userStatusModel = require("../../models/userStatus");

const cookieName = config.get("userToken.cookieName");
const { userPhotoVerificationData } = require("../fixtures/user/photo-verification");
const Sinon = require("sinon");
const { INTERNAL_SERVER_ERROR } = require("../../constants/errorMessages");
const photoVerificationModel = firestore.collection("photo-verification");
chai.use(chaiHttp);

describe("Users", function () {
  let jwt;
  let superUserId;
  let superUserAuthToken;
  let userId = "";

  beforeEach(async function () {
    userId = await addUser();
    jwt = authService.generateAuthToken({ userId });
    superUserId = await addUser(superUser);
    superUserAuthToken = authService.generateAuthToken({ userId: superUserId });

    const userDocRef = photoVerificationModel.doc();
    userPhotoVerificationData.userId = userId;
    await userDocRef.set(userPhotoVerificationData);
  });

  afterEach(async function () {
    await cleanDb();
  });

  describe("PATCH /users/self", function () {
    it("Should update the user", function (done) {
      chai
        .request(app)
        .patch("/users/self")
        .set("cookie", `${cookieName}=${jwt}`)
        .send({
          first_name: "Test first_name",
        })
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(204);

          return done();
        });
    });

    it("Should update the user status", function (done) {
      chai
        .request(app)
        .patch("/users/self")
        .set("cookie", `${cookieName}=${jwt}`)
        .send({
          status: "ooo",
        })
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(204);

          return done();
        });
    });

    it("Should return 400 for invalid status value", function (done) {
      chai
        .request(app)
        .patch("/users/self")
        .set("cookie", `${cookieName}=${jwt}`)
        .send({
          status: "blah",
        })
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(400);
          expect(res.body).to.be.an("object");
          expect(res.body).to.eql({
            statusCode: 400,
            error: "Bad Request",
            message: '"status" must be one of [ooo, idle, active]',
          });

          return done();
        });
    });
  });

  describe("GET /users", function () {
    beforeEach(async function () {
      await addOrUpdate(userData[0]);
      await addOrUpdate(userData[1]);
      await addOrUpdate(userData[2]);
      await addOrUpdate(userData[3]);
    });

    afterEach(async function () {
      await cleanDb();
    });

    it("Should get all the users in system", function (done) {
      chai
        .request(app)
        .get("/users")
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Users returned successfully!");
          expect(res.body.users).to.be.a("array");
          expect(res.body.users[0]).to.not.have.property("phone");
          expect(res.body.users[0]).to.not.have.property("email");

          return done();
        });
    });
    it("Should get all the users with archived false", function (done) {
      chai
        .request(app)
        .get("/users")
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Users returned successfully!");
          expect(res.body.users).to.be.a("array");
          const userData = res.body.users;
          userData.forEach((user) => {
            expect(user.roles.archived).to.equal(false);
          });
          return done();
        });
    });

    it("Should get all the users in system when query params are valid", function (done) {
      chai
        .request(app)
        .get("/users")
        .query({
          size: 1,
          page: 0,
        })
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Users returned successfully!");
          expect(res.body.users).to.be.a("array");
          expect(res.body.users.length).to.equal(1);
          expect(res.body.users[0]).to.not.have.property("phone");
          expect(res.body.users[0]).to.not.have.property("email");

          return done();
        });
    });

    it("Should return 400 bad request when query params are invalid", function (done) {
      chai
        .request(app)
        .get("/users")
        .query({
          size: -1,
          page: -1,
        })
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(400);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("size must be in range 1-100");
          expect(res.body.error).to.equal("Bad Request");

          return done();
        });
    });

    it("Should return 400 bad request when query param size is invalid", function (done) {
      chai
        .request(app)
        .get("/users")
        .query({
          size: 101,
        })
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(400);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("size must be in range 1-100");
          expect(res.body.error).to.equal("Bad Request");

          return done();
        });
    });

    it("Should return next and prev links", function (done) {
      chai
        .request(app)
        .get("/users?size=2")
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Users returned successfully!");
          expect(res.body).to.have.property("links");
          expect(res.body.links).to.have.property("next");
          expect(res.body.links).to.have.property("prev");

          return done();
        });
    });

    it("Should return 400 when both prev and next passed as query param", function (done) {
      chai
        .request(app)
        .get(`/users?next=${userId}&prev=${userId}&size=2`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(400);
          expect(res.body.message).to.equal("Both prev and next can't be passed");

          return done();
        });
    });

    it("Should return 400 when both page and next passed as query param", function (done) {
      chai
        .request(app)
        .get(`/users?next=${userId}&page=1&size=2`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(400);
          expect(res.body.message).to.equal("Both page and next can't be passed");

          return done();
        });
    });

    it("Should return 400 when both page and prev passed as query param", function (done) {
      chai
        .request(app)
        .get(`/users?page=1&prev=${userId}&size=2`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(400);
          expect(res.body.message).to.equal("Both page and prev can't be passed");

          return done();
        });
    });

    it("Should include search and size query params in the response links that are passed by the request", function (done) {
      chai
        .request(app)
        .get(`/users?search=an&size=2`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Users returned successfully!");
          expect(res.body).to.have.property("links");
          expect(res.body.links).to.have.property("next");
          expect(res.body.links).to.have.property("prev");
          expect(res.body.links.next).includes("search");
          expect(res.body.links.next).includes("size");
          expect(res.body.links.prev).includes("search");
          expect(res.body.links.prev).includes("size");

          return done();
        });
    });

    it("Should not have page param in the response links if passed by the request", function (done) {
      chai
        .request(app)
        .get(`/users?page=1&size=2`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Users returned successfully!");
          expect(res.body).to.have.property("links");
          expect(res.body.links).to.have.property("next");
          expect(res.body.links).to.have.property("prev");
          expect(res.body.links.next).to.not.includes("page");
          expect(res.body.links.prev).to.not.includes("page");

          return done();
        });
    });

    it("Should get next and previous page results based upon the links in the response", async function () {
      const response = await chai.request(app).get(`/users?size=2`);
      expect(response).to.have.status(200);
      expect(response.body).to.be.a("object");
      expect(response.body.message).to.equal("Users returned successfully!");
      expect(response.body).to.have.property("links");
      expect(response.body.links).to.have.property("next");
      expect(response.body.links).to.have.property("prev");

      const nextPageLink = response.body.links.next;
      const nextPageResponse = await chai.request(app).get(nextPageLink);

      expect(nextPageResponse).to.have.status(200);
      expect(nextPageResponse.body).to.be.a("object");
      expect(nextPageResponse.body.message).to.equal("Users returned successfully!");
      expect(nextPageResponse.body).to.have.property("links");
      expect(nextPageResponse.body.links).to.have.property("next");
      expect(nextPageResponse.body.links).to.have.property("prev");
      expect(nextPageResponse.body.users).to.have.length(2);

      const prevPageLink = nextPageResponse.body.links.prev;
      const previousPageResponse = await chai.request(app).get(prevPageLink);

      expect(previousPageResponse).to.have.status(200);
      expect(previousPageResponse.body).to.be.a("object");
      expect(previousPageResponse.body.message).to.equal("Users returned successfully!");
      expect(previousPageResponse.body).to.have.property("links");
      expect(previousPageResponse.body.links).to.have.property("next");
      expect(previousPageResponse.body.links).to.have.property("prev");
      expect(previousPageResponse.body.users).to.have.length(2);
    });
  });

  describe("GET /users/self", function () {
    it("Should return the logged user's details", function (done) {
      chai
        .request(app)
        .get("/users/self")
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body).to.not.have.property("phone");
          expect(res.body).to.not.have.property("email");

          return done();
        });
    });

    it("Should return details with phone and email when query 'private' is true", function (done) {
      chai
        .request(app)
        .get("/users/self")
        .query({ private: true })
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done();
          }

          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body).to.have.property("phone");
          expect(res.body).to.have.property("email");

          return done();
        });
    });

    it("Should return 401 if not logged in", function (done) {
      chai
        .request(app)
        .get("/users/self")
        .end((err, res) => {
          if (err) {
            return done();
          }

          expect(res).to.have.status(401);
          expect(res.body).to.be.an("object");
          expect(res.body).to.eql({
            statusCode: 401,
            error: "Unauthorized",
            message: "Unauthenticated User",
          });

          return done();
        });
    });
  });

  describe("GET /users/id", function () {
    it("Should return one user with given id", function (done) {
      chai
        .request(app)
        .get(`/users/${userData[0].username}`)
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("User returned successfully!");
          expect(res.body.user).to.be.a("object");
          expect(res.body.user).to.not.have.property("phone");
          expect(res.body.user).to.not.have.property("email");

          return done();
        });
    });

    it("Should return 404 if there is no user in the system", function (done) {
      chai
        .request(app)
        .get("/users/invalidUser")
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(404);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("User doesn't exist");

          return done();
        });
    });
  });

  describe("GET /users/userId/id", function () {
    it("Should return one user with given id", function (done) {
      chai
        .request(app)
        .get(`/users/userId/${userId}`)
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("User returned successfully!");
          expect(res.body.user).to.be.a("object");
          return done();
        });
    });

    it("Should return 404 if there is no user in the system", function (done) {
      chai
        .request(app)
        .get("/users/userId/invalidUserId")
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(404);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("User doesn't exist");

          return done();
        });
    });
  });

  describe("GET /users/isUsernameAvailable/username", function () {
    it("Should return isUsernameAvailable as true as we are passing new user", function (done) {
      chai
        .request(app)
        .get("/users/isUsernameAvailable/availableUser")
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done();
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.isUsernameAvailable).to.equal(true);

          return done();
        });
    });

    it("Should return isUsernameAvailable as false as we are passing existing user", function (done) {
      chai
        .request(app)
        .get(`/users/isUsernameAvailable/${userData[0].username}`)
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done();
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.isUsernameAvailable).to.equal(false);

          return done();
        });
    });
  });

  describe("GET /users/:userId/intro", function () {
    beforeEach(async function () {
      await addJoinData(joinData(userId)[0]);
    });
    it("Should return data of the given username", function (done) {
      chai
        .request(app)
        .get(`/users/${userId}/intro`)
        .set("Cookie", `${cookieName}=${superUserAuthToken}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("User data returned");
          return done();
        });
    });
    it("Should return 404 if user not Found", function (done) {
      chai
        .request(app)
        .get(`/users/ritiksuserId/intro`)
        .set("Cookie", `${cookieName}=${superUserAuthToken}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(404);
          expect(res.body).to.be.a("object");
          return done();
        });
    });
    it("Should return 401 is not Logged In", function (done) {
      chai
        .request(app)
        .get(`/users/${userId}/intro`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(401);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.be.equal("Unauthenticated User");
          return done();
        });
    });
  });

  describe("GET /users/?id", function () {
    afterEach(async function () {
      await cleanDb();
    });

    it("Should return given user by id", async function () {
      const { userId } = await addOrUpdate(userData[0]);
      const res = await chai.request(app).get(`/users/?id=${userId}`);
      expect(res).to.have.status(200);
      expect(res.body).to.be.a("object");
      expect(res.body.message).to.equal("User returned successfully!");
      expect(res.body.user).to.be.a("object");
      expect(Object.keys(res.body.user)).to.include.members([
        "username",
        "first_name",
        "last_name",
        "yoe",
        "linkedin_id",
        "github_id",
        "isMember",
        "roles",
      ]);
      expect(Object.keys(res.body.user)).to.not.include.members(["phone", "email"]);
      expect(res.body.user.id).to.equal(userId);
    });

    it("Should return 404 if user not Found", function (done) {
      chai
        .request(app)
        .get(`/users/?id=anyRandomuserId`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(404);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("User doesn't exist");
          return done();
        });
    });
  });

  describe("GET /users?search", function () {
    beforeEach(async function () {
      await addOrUpdate(userData[0]);
      await addOrUpdate(userData[7]);
    });

    afterEach(async function () {
      await cleanDb();
    });

    it("Should return users successfully", function (done) {
      chai
        .request(app)
        .get("/users")
        .query({ search: searchParamValues.an })
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Users returned successfully!");
          expect(res.body.users).to.be.a("array");

          return done();
        });
    });
    it("Should return users successfully converting search param value to small case", function (done) {
      chai
        .request(app)
        .get("/users")
        .query({ search: searchParamValues.AN })
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Users returned successfully!");
          expect(res.body.users).to.be.a("array");
          res.body.users.forEach((user) => {
            expect(user.username.slice(0, 2)).to.equal(searchParamValues.AN.toLowerCase());
          });
          return done();
        });
    });
    it("Should return 400 for empty value of search param", function (done) {
      chai
        .request(app)
        .get("/users")
        .query({ search: searchParamValues.null })
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(400);

          return done();
        });
    });
    it("Should return users of username starting with '23' with response status code 200", function (done) {
      chai
        .request(app)
        .get("/users")
        .query({ search: searchParamValues.number23 })
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Users returned successfully!");
          expect(res.body.users).to.be.a("array");
          res.body.users.forEach((user) => {
            expect(user.username.slice(0, 2)).to.equal(`${searchParamValues.number23}`);
          });
          return done();
        });
    });
    it("Should return an empty array with response status code 200", function (done) {
      chai
        .request(app)
        .get("/users")
        .query({ search: searchParamValues.mu })
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Users returned successfully!");

          return done();
        });
    });
  });

  describe("PUT /users/self/intro", function () {
    let userStatusData;
    beforeEach(async function () {
      await userStatusModel.updateUserStatus(userId, userStatusDataAfterSignup);
      const updateStatus = await userStatusModel.updateUserStatus(userId, userStatusDataAfterFillingJoinSection);
      userStatusData = (await firestore.collection("usersStatus").doc(updateStatus.id).get()).data();
    });
    it("should return 409 if the data already present", function (done) {
      addJoinData(joinData(userId)[3]);
      chai
        .request(app)
        .put(`/users/self/intro`)
        .set("Cookie", `${cookieName}=${jwt}`)
        .send(joinData(userId)[3])
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(409);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("User data is already present!");
          return done();
        });
    });

    it("Should store the info in db", function (done) {
      chai
        .request(app)
        .put(`/users/self/intro`)
        .set("Cookie", `${cookieName}=${jwt}`)
        .send(joinData()[2])
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(201);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("User join data and newstatus data added and updated successfully");
          expect(userStatusData).to.have.own.property("currentStatus");
          expect(userStatusData).to.have.own.property("monthlyHours");
          expect(userStatusData.currentStatus.state).to.equal("ONBOARDING");
          expect(userStatusData.monthlyHours.committed).to.equal(40);
          return done();
        });
    });

    it("Should return 401 for unauthorized request", function (done) {
      chai
        .request(app)
        .put(`/users/self/intro`)
        .set("Cookie", `${cookieName}=""`)
        .send(joinData()[2])
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(401);
          expect(res.body).to.be.a("object");
          return done();
        });
    });

    it("Should return 400 for invalid Data", function (done) {
      chai
        .request(app)
        .put(`/users/self/intro`)
        .set("Cookie", `${cookieName}=${jwt}`)
        .send(joinData()[1])
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(400);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.be.equal('"firstName" is required');
          return done();
        });
    });
  });

  describe("PATCH /users/rejectDiff", function () {
    let profileDiffsId;
    beforeEach(async function () {
      profileDiffsId = await profileDiffs.add({ userId, ...profileDiffData[0] });
    });
    it("Should update reject the profileDiff specified, using authorized user (super_user)", function (done) {
      chai
        .request(app)
        .patch(`/users/rejectDiff`)
        .set("cookie", `${cookieName}=${superUserAuthToken}`)
        .send({
          profileDiffId: `${profileDiffsId}`,
          message: "",
        })
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Profile Diff Rejected successfully!");
          return done();
        });
    });

    it("Should return unauthorized error when not authorized", function (done) {
      chai
        .request(app)
        .patch(`/users/rejectDiff`)
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(401);
          expect(res.body.error).to.be.equal("Unauthorized");
          expect(res.body.message).to.be.equal("You are not authorized for this action.");
          return done();
        });
    });

    it("Should return unauthorized error when not logged in", function (done) {
      chai
        .request(app)
        .patch(`/users/rejectDiff`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(401);
          expect(res.body).to.eql({
            statusCode: 401,
            error: "Unauthorized",
            message: "Unauthenticated User",
          });
          return done();
        });
    });
  });

  describe("PATCH /users/:userId", function () {
    let profileDiffsId;
    beforeEach(async function () {
      profileDiffsId = await profileDiffs.add({ userId, ...profileDiffData[0] });
    });
    it("Should update the user profile with latest pending profileDiffs, using authorized user (super_user)", function (done) {
      chai
        .request(app)
        .patch(`/users/${userId}`)
        .set("cookie", `${cookieName}=${superUserAuthToken}`)
        .send({
          id: `${profileDiffsId}`,
          first_name: "Ankur",
          last_name: "Narkhede",
          yoe: 0,
          company: "",
          designation: "AO",
          github_id: "ankur1337",
          linkedin_id: "ankurnarkhede",
          twitter_id: "ankur909",
          instagram_id: "",
          website: "",
          message: "",
        })
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Updated user's data successfully!");
          return done();
        });
    });

    it("Should return unauthorized error when not authorized", function (done) {
      chai
        .request(app)
        .patch(`/users/${userId}`)
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(401);
          expect(res.body.error).to.be.equal("Unauthorized");
          expect(res.body.message).to.be.equal("You are not authorized for this action.");
          return done();
        });
    });

    it("Should return unauthorized error when not logged in", function (done) {
      chai
        .request(app)
        .patch(`/users/${userId}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(401);
          expect(res.body).to.eql({
            statusCode: 401,
            error: "Unauthorized",
            message: "Unauthenticated User",
          });
          return done();
        });
    });
  });

  describe("GET /users/chaincode", function () {
    it("Should save the userId and timestamp in firestore collection and return the document ID as chaincode in response", function (done) {
      chai
        .request(app)
        .get("/users/chaincode")
        .set("cookie", `${cookieName}=${jwt}`)
        .end(async (err, res) => {
          if (err) {
            return done();
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Chaincode returned successfully");
          expect(res.body.chaincode).to.be.a("string");
          return done();
        });
    });

    it("Should return 401 if user not logged in", function (done) {
      chai
        .request(app)
        .get("/users/chaincode")
        .end((err, res) => {
          if (err) {
            return done();
          }
          expect(res).to.have.status(401);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Unauthenticated User");
          return done();
        });
    });
  });

  describe("PATCH /users/profileURL", function () {
    it("Should update the profileURL", function (done) {
      chai
        .request(app)
        .patch("/users/profileURL")
        .set("cookie", `${cookieName}=${jwt}`)
        .send({
          profileURL: "http://localhost:3000/healthcheck",
        })
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("updated profile URL!!");
          return done();
        });
    });
    it("Should return 400 for invalid profileURL value", function (done) {
      chai
        .request(app)
        .patch("/users/profileURL")
        .set("cookie", `${cookieName}=${jwt}`)
        .send({
          profileURL: "random",
        })
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(400);
          expect(res.body).to.be.an("object");
          expect(res.body).to.eql({
            statusCode: 400,
            error: "Bad Request",
            message: '"profileURL" must be a valid uri',
          });

          return done();
        });
    });
    it("Should return 400 for no profileURL value", function (done) {
      chai
        .request(app)
        .patch("/users/profileURL")
        .set("cookie", `${cookieName}=${jwt}`)
        .send({})
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res).to.have.status(400);
          expect(res.body).to.be.an("object");
          expect(res.body).to.eql({
            statusCode: 400,
            error: "Bad Request",
            message: '"profileURL" is required',
          });
          return done();
        });
    });
  });

  describe("POST /users/verify", function () {
    it("Should queue the Request", function (done) {
      chai
        .request(app)
        .post("/users/verify")
        .set("cookie", `${cookieName}=${jwt}`)
        .end((err, res) => {
          if (err) {
            return done();
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Your request has been queued successfully");
          return done();
        });
    });

    it("Should return 401 if the user is not logged in", function (done) {
      chai
        .request(app)
        .post("/users/verify")
        .end((err, res) => {
          if (err) {
            return done();
          }
          expect(res).to.have.status(401);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("Unauthenticated User");
          return done();
        });
    });
  });

  describe("PATCH /users/picture/verify/id", function () {
    it("Should verify the discord image of the user", function (done) {
      chai
        .request(app)
        .patch(`/users/picture/verify/${userId}?type=discord`)
        .set("cookie", `${cookieName}=${superUserAuthToken}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.message).to.equal("discord image was verified successfully!");
          return done();
        });
    });
    it("Should throw for wrong query while verifying the discord image of the user", function (done) {
      chai
        .request(app)
        .patch(`/users/picture/verify/${userId}?type=RANDOM`)
        .set("cookie", `${cookieName}=${superUserAuthToken}`)
        .end((err, res) => {
          if (err) {
            return done();
          }
          expect(res).to.have.status(400);
          expect(res.body.message).to.equal("Invalid verification type was provided!");
          return done();
        });
    });
  });
  describe("GET /users/picture/id", function () {
    it("Should get the user's verification record", function (done) {
      chai
        .request(app)
        .get(`/users/picture/${userId}`)
        .set("cookie", `${cookieName}=${superUserAuthToken}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body).to.be.a("object");
          expect(res.body.data).to.deep.equal(userPhotoVerificationData);
          expect(res.body.message).to.equal("User image verification record fetched successfully!");
          return done();
        });
    });
    it("Should throw error if no user's verification record was found", function (done) {
      chai
        .request(app)
        .get("/users/picture/some-unknown-user-id")
        .set("cookie", `${cookieName}=${superUserAuthToken}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(500);
          expect(res.body.message).to.equal("An internal server error occurred");
          return done();
        });
    });
  });

  describe("POST /update-in-discord", function () {
    it("it returns proper response", function (done) {
      chai
        .request(app)
        .post("/users/update-in-discord")
        .set("Cookie", `${cookieName}=${superUserAuthToken}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(200);
          expect(res.body.message).to.be.equal("Successfully added the in_discord field to false for all users");
          return done();
        });
    });
  });

  describe("POST /", function () {
    let fetchStub;
    beforeEach(async function () {
      fetchStub = Sinon.stub(global, "fetch");
    });
    afterEach(async function () {
      Sinon.restore();
      await cleanDb();
    });
    it("tests adding unverified role to user", function (done) {
      fetchStub.returns(
        Promise.resolve({
          status: 200,
          json: () => Promise.resolve(getDiscordMembers),
        })
      );
      chai
        .request(app)
        .post("/users")
        .set("Cookie", `${cookieName}=${superUserAuthToken}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(fetchStub.calledOnce).to.be.equal(true);
          expect(res).to.have.status(200);
          expect(res.body.message).to.be.equal("ROLES APPLIED SUCCESSFULLY");
          return done();
        });
    });

    it("Gives internal server error", function (done) {
      fetchStub.throws(new Error("OOps"));
      chai
        .request(app)
        .post("/users")
        .set("Cookie", `${cookieName}=${superUserAuthToken}`)
        .end((err, res) => {
          if (err) {
            return done(err);
          }
          expect(res).to.have.status(500);
          expect(res.body.message).to.be.equal(INTERNAL_SERVER_ERROR);
          return done();
        });
    });
  });
});
