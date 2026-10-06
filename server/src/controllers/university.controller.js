const universityService = require('../services/university.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const data = await universityService.listUniversities(req.query);
  return success(res, data, 'Universities fetched');
});

const getById = asyncHandler(async (req, res) => {
  const data = await universityService.getUniversityById(req.params.id);
  return success(res, data, 'University fetched');
});

const create = asyncHandler(async (req, res) => {
  const data = await universityService.createUniversity(req.body);
  return success(res, data, 'University created', 201);
});

const update = asyncHandler(async (req, res) => {
  const data = await universityService.updateUniversity(req.params.id, req.body);
  return success(res, data, 'University updated');
});

const remove = asyncHandler(async (req, res) => {
  const data = await universityService.removeUniversity(req.params.id);
  return success(res, data, 'University deactivated');
});

const downloadTemplate = asyncHandler(async (req, res) => {
  const buffer = await universityService.generateTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="university-import-template.xlsx"');
  return res.send(buffer);
});

const previewImport = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  const data = await universityService.previewImport(req.file.buffer, req.file.originalname);
  return success(res, data, 'Preview generated');
});

const importUniversities = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  // First preview to validate, then execute
  const preview = await universityService.previewImport(req.file.buffer, req.file.originalname);
  const result = await universityService.executeImport(preview.rows);
  return success(res, { ...result, summary: preview.summary }, 'Import completed');
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  downloadTemplate,
  previewImport,
  importUniversities,
};
