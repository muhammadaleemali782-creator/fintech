require('dotenv').config();
const mongoose = require('mongoose');
const { encryptData, isEncrypted } = require('../utils/cryptoHelper');
const User = require('../models/User');
const Loan = require('../models/Loan');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing in .env');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const users = await User.find({ kycDocuments: { $exists: true } });
  let userEncCount = 0;
  for (const u of users) {
    let updated = false;
    if (u.kycDocuments) {
      ['doc1Url', 'doc1BackUrl', 'doc2Url', 'doc2BackUrl', 'chequeUrl', 'docUrl', 'aadharUrl', 'panUrl'].forEach(field => {
        const val = u.kycDocuments[field];
        if (val && typeof val === 'string' && val.length > 50 && !isEncrypted(val)) {
          u.kycDocuments[field] = encryptData(val);
          updated = true;
          userEncCount++;
        }
      });
      if (updated) {
        u.markModified('kycDocuments');
        await u.save();
      }
    }
  }
  console.log(`Encrypted ${userEncCount} user document fields.`);

  const loans = await Loan.find({ documents: { $exists: true } });
  let loanEncCount = 0;
  for (const l of loans) {
    let updated = false;
    if (l.documents) {
      ['doc1Url', 'doc1BackUrl', 'doc2Url', 'doc2BackUrl', 'chequeUrl', 'aadharUrl', 'panUrl', 'photoUrl', 'offlineEvidenceUrl'].forEach(field => {
        const val = l.documents[field];
        if (val && typeof val === 'string' && val.length > 50 && !isEncrypted(val)) {
          l.documents[field] = encryptData(val);
          updated = true;
          loanEncCount++;
        }
      });
      if (updated) {
        l.markModified('documents');
        await l.save();
      }
    }
  }
  console.log(`Encrypted ${loanEncCount} loan document fields.`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
