const crypto = require('crypto');

const generateUniqueId = (prefix) => {
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  const timestampPart = Date.now().toString().slice(-6);
  return `${prefix}-${randomPart}-${timestampPart}`;
};

module.exports = { generateUniqueId };
