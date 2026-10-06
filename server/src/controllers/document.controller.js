const documentService = require('../services/document.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/ApiResponse');

const getDocumentsByLead = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  if (!leadId) throw new ApiError(400, 'leadId is required');
  const docs = await documentService.getDocumentsByLead(leadId);
  return success(res, { documents: docs }, 'Documents fetched');
});

const getDocumentSummary = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  if (!leadId) throw new ApiError(400, 'leadId is required');
  const summary = await documentService.getDocumentSummary(leadId);
  return success(res, summary, 'Document summary fetched');
});

const createDocument = asyncHandler(async (req, res) => {
  const { lead, documentType, documentName, category, required, status, remarks } = req.body;
  if (!lead || !documentType) throw new ApiError(400, 'lead and documentType are required');
  const doc = await documentService.createDocument({ lead, documentType, documentName, category, required, status, remarks }, req.user._id);
  return success(res, { document: doc }, 'Document created', 201);
});

const updateDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) throw new ApiError(400, 'Document id is required');
  const doc = await documentService.updateDocument(id, req.body, req.user._id);
  return success(res, { document: doc }, 'Document updated');
});

const deleteDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) throw new ApiError(400, 'Document id is required');
  await documentService.deleteDocument(id);
  return success(res, null, 'Document deleted');
});

const bulkCreateDocuments = asyncHandler(async (req, res) => {
  const { leadId, documents } = req.body;
  if (!leadId || !Array.isArray(documents)) throw new ApiError(400, 'leadId and documents array are required');
  const docs = await documentService.bulkCreateDocuments(leadId, documents, req.user._id);
  return success(res, { documents: docs, count: docs.length }, 'Documents created', 201);
});

const getDocumentQueue = asyncHandler(async (req, res) => {
  const data = await documentService.getDocumentQueue(req.user._id, req.query);
  return success(res, data, 'Document queue fetched');
});

module.exports = {
  getDocumentsByLead,
  getDocumentSummary,
  createDocument,
  updateDocument,
  deleteDocument,
  bulkCreateDocuments,
  getDocumentQueue,
};
