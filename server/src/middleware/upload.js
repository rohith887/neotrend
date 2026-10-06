const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Accepted import spreadsheets. Note: ExcelJS reads modern .xlsx and
// .csv natively; legacy binary .xls is detected later and rejected with
// a clear, actionable message (re-save as .xlsx).
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = String(file.originalname || '').split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(`.${ext}`)) {
      return cb(new ApiError(400, 'Unsupported file type. Please upload a .xlsx, .xls or .csv file.'));
    }
    cb(null, true);
  },
});

module.exports = upload;
