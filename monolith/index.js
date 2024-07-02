const { ApolloServer } = require("@apollo/server");
const { startStandaloneServer } = require("@apollo/server/standalone");
const { buildSubgraphSchema } = require("@apollo/subgraph");

const { readFileSync } = require("fs");
const axios = require("axios");
const gql = require("graphql-tag");

const { AuthenticationError } = require("./utils/errors");

const typeDefs = gql(readFileSync("./schema.graphql", { encoding: "utf-8" }));
const resolvers = require("./resolvers");

const BookingsDataSource = require("./datasources/bookings");
const ReviewsDataSource = require("./datasources/reviews");
const ListingsAPI = require("./datasources/listings");
const AccountsAPI = require("./datasources/accounts");
const PaymentsAPI = require("./datasources/payments");

async function startApolloServer() {
  const server = new ApolloServer({
    schema: buildSubgraphSchema({
      typeDefs,
      resolvers,
    }),
  });

  const port = 4001;

  try {
    const { url } = await startStandaloneServer(server, {
      context: async ({ req }) => {
        // 1) Retrieve the Bearer token from the request's Authorization header
        //    (Note the lowercase "a" in authorization,
        //    because all headers are transformed to lowercase)
        const token = req.headers.authorization || "";
        // Get the user token after "Bearer "
        const userId = token.split(" ")[1];

        let userInfo = {};
        if (userId) {
          // 2) Authenticate the user using the accounts API endpoint
          const { data } = await axios
            .get(`http://localhost:4011/login/${userId}`)
            .catch((error) => {
              throw AuthenticationError();
            });

          userInfo = { userId: data.id, userRole: data.role };
        }

        const { cache } = server;

        // 3) After a successful login, store the user's id and role
        //    in the `contextValue` object, for the resolvers to use
        return {
          ...userInfo,
          dataSources: {
            bookingsDb: new BookingsDataSource(),
            reviewsDb: new ReviewsDataSource(),
            listingsAPI: new ListingsAPI({ cache }),
            accountsAPI: new AccountsAPI({ cache }),
            paymentsAPI: new PaymentsAPI({ cache }),
          },
        };
      },
      listen: {
        port,
      },
    });

    console.log(`🚀  Server ready at ${url}`);
  } catch (err) {
    console.error(err);
  }
}

startApolloServer();
