const { PrismaClient } = /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '')
  ? require('../../generated/postgres') : require('@prisma/client');

const prisma = new PrismaClient();
const context = require('./transactionContext');
module.exports = new Proxy(prisma, {
  get(target, key) {
    if (key === '$root') return target;
    const client = context.getStore()?.client || target;
    const value = client[key] === undefined ? target[key] : client[key];
    return typeof value === 'function' ? value.bind(client[key] === undefined ? target : client) : value;
  },
});
