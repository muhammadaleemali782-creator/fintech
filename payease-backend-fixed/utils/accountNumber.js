/**
 * Unified Account Number Generator
 * Strict format: EFS0000XXX (e.g. EFS0000001, EFS0000002)
 */
const generateAccountNumber = async (Model) => {
  const count = await Model.countDocuments({ accountNumber: { $exists: true } });
  let seq = count + 1;
  let accNo = `EFS0000${String(seq).padStart(3, '0')}`;
  while (await Model.findOne({ accountNumber: accNo })) {
    seq++;
    accNo = `EFS0000${String(seq).padStart(3, '0')}`;
  }
  return accNo;
};

module.exports = { generateAccountNumber };
