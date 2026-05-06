const AWS = require('aws-sdk');
require('dotenv').config();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const uploadToS3 = async (file) => {
  const key = `onboarding/${Date.now()}_${file.originalname}`;
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  try {
    await s3.upload(params).promise();
    return key;
  } catch (error) {
    console.error('S3 Upload Error:', error);
    throw new Error('Failed to upload file to S3');
  }
};

// Returns a pre-signed URL valid for `expiresIn` seconds (default 15 minutes).
const getPresignedUrl = (key, expiresIn = 900) => {
  return s3.getSignedUrl('getObject', {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Expires: expiresIn,
  });
};

module.exports = { uploadToS3, getPresignedUrl };
