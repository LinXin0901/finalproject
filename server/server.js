const fs = require('fs');
const express = require('express');
const { ApolloServer, UserInputError } = require('apollo-server-express');
const { GraphQLScalarType } = require('graphql');
const { Kind } = require('graphql/language');
const { MongoClient } = require('mongodb');

const url = 'mongodb://localhost/issuetracker';

// Atlas URL  - replace UUU with user, PPP with password, XXX with hostname
// const url = 'mongodb+srv://UUU:PPP@cluster0-XXX.mongodb.net/issuetracker?retryWrites=true';

// mLab URL - replace UUU with user, PPP with password, XXX with hostname
// const url = 'mongodb://UUU:PPP@XXX.mlab.com:33533/issuetracker';

let db;

let aboutMessage = "Issue Tracker API v1.0";

const GraphQLDate = new GraphQLScalarType({
  name: 'GraphQLDate',
  description: 'A Date() type in GraphQL as a scalar',
  serialize(value) {
    return value.toISOString();
  },
  parseValue(value) {
    const dateValue = new Date(value);
    return isNaN(dateValue) ? undefined : dateValue;
  },
  parseLiteral(ast) {
    if (ast.kind == Kind.STRING) {
      const value = new Date(ast.value);
      return isNaN(value) ? undefined : value;
    }
  },
});

const resolvers = {
  Query: {
    about: () => aboutMessage,
    issueList,
    storeList,
    storeFind,
  },
  Mutation: {
    setAboutMessage,
    issueAdd,
    issueDelete,
  },
  GraphQLDate,
};

function setAboutMessage(_, { message }) {
  return aboutMessage = message;
}

async function storeFind(_, { store }) {
  const result = await db.collection('stores').find({name: {$regex:store.name, $options:"i"}}).toArray();
  return result;
}

async function queueJoin(_, { store }) {
  const result = await db.collection('stores').updateOne({name: {$regex:store.name, $options:"i"}},{$set: {queue:2}});
  return result;
}

async function issueList() {
  const issues = await db.collection('issues').find({}).toArray();
  return issues;
}

async function storeList() {
  const stores = await db.collection('stores').find({}).toArray();
  return stores;
}

async function getNextSequence(name) {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { current: 1 } },
    { returnOriginal: false },
  );
  return result.value.current;
}

function issueValidate(issue) {
  const errors = [];
  if (issue.name.length < 1) {
    errors.push('Fail to add! Name cannot be empty!');
  }
  if (issue.phoneNum.length != 8) {
    errors.push('Fail to add! Phone format is wrong!');
  }
  if (errors.length > 0) {
    throw new UserInputError('Invalid input(s)', { errors });
  }
}

async function issueAdd(_, { issue }) {
  issueValidate(issue);
  issue.created = new Date();
  issue.id = await getNextSequence('issues');

  const result = await db.collection('issues').insertOne(issue);
  const savedIssue = await db.collection('issues')
    .findOne({ _id: result.insertedId });
  return savedIssue;
}

async function issueDelete(_, { issue }) {
  const id = await db.collection('issues').findOne({id: issue.id})
  const errors = [];
  if (!id) {
    errors.push('No this number!');
    throw new UserInputError('Invalid input(s)', { errors });
  } else {
    const result = await db.collection('issues').deleteOne({id: issue.id});
    return result
  }
}

async function connectToDb() {
  const client = new MongoClient(url, { useNewUrlParser: true });
  await client.connect();
  console.log('Connected to MongoDB at', url);
  db = client.db();
}

const server = new ApolloServer({
  typeDefs: fs.readFileSync('./server/schema.graphql', 'utf-8'),
  resolvers,
  formatError: error => {
    console.log(error);
    return error;
  },
});

const app = express();

app.use(express.static('public'));

server.applyMiddleware({ app, path: '/graphql' });

(async function () {
  try {
    await connectToDb();
    app.listen(3000, function () {
      console.log('App started on port 3000');
    });
  } catch (err) {
    console.log('ERROR:', err);
  }
})();