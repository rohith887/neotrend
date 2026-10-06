const NAMES = [
  'Aarav Sharma', 'Diya Patel', 'Kabir Mehta', 'Ananya Iyer', 'Rohan Verma',
  'Ishita Reddy', 'Vivaan Joshi', 'Sara Khan', 'Arjun Nair', 'Priya Singh',
  'Sahil Gupta', 'Nisha Menon', 'Dev Malhotra', 'Riya Kapoor', 'Aryan Desai',
  'Tanvi Kulkarni', 'Om Bhatt', 'Meera Pillai', 'Yash Chopra', 'Zoya Sheikh',
  'Kunal Tandon', 'Aditi Rao', 'Raghav Saxena',
];

const SAMPLE_PAYMENTS = NAMES.map((name, i) => ({
  _id: `p${i + 1}`,
  studentName: name,
  referenceId: `TASA-${3100 + i}`,
  paymentType: ['Registration Fee', 'Application Fee', 'Other Fee'][i % 3],
  status: ['pending', 'link-sent', 'partially-paid', 'paid', 'failed', 'refunded'][i % 6],
  amount: 25000 + i * 5000,
  currency: 'INR',
  dueDate: `2026-0${(i % 9) + 1}-15T00:00:00.000Z`,
  paidDate: i % 2 ? `2026-0${(i % 9) + 1}-20T00:00:00.000Z` : null,
  transactionRef: i % 2 ? `TXN${i * 7}${i * 13}` : null,
  paymentLink: null,
  remarks: null,
  createdAt: `2026-09-01T10:00:00.000Z`,
  updatedAt: `2026-09-01T10:00:00.000Z`,
  createdBy: { firstName: 'Rohith', lastName: 'Sharma', email: 'rohith@tasa.com' },
}));

export const fetchPayments = (params = {}) => {
  const { search = '', status = '', paymentType = '', page = 1, limit = 25 } = params;
  const q = String(search).toLowerCase();
  let rows = SAMPLE_PAYMENTS.filter((p) => {
    if (q && !String(p.studentName).toLowerCase().includes(q) && !String(p.referenceId).toLowerCase().includes(q)) return false;
    if (status && p.status !== status) return false;
    if (paymentType && p.paymentType !== paymentType) return false;
    return true;
  });
  const total = rows.length;
  const start = (page - 1) * limit;
  return Promise.resolve({ payments: rows.slice(start, start + limit), total, page, limit });
};

export const fetchPaymentSummary = () =>
  Promise.resolve({ totalStudents: 4, pending: 2, linkSent: 1, paid: 1, totalCollected: 25000 });

export const fetchPayment = (id) =>
  Promise.resolve({ payment: SAMPLE_PAYMENTS.find((p) => p._id === id) ?? null });

export const createPayment = async () => null;
export const updatePayment = async () => null;
export const deletePayment = async () => null;