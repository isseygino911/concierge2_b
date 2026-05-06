const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

const generateToken = (payload, expiresIn = '24h') => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const generateRandomToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  generateRandomToken,
  JWT_SECRET
};
