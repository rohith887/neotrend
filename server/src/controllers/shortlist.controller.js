const shortlistService = require('../services/shortlist.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');

/* Student ↔ University shortlist — all routes are student-scoped and
   permission-checked inside the service (supervisor or assigned user). */

const getShortlist = asyncHandler(async (req, res) => {
  const entries = await shortlistService.getForLead(req.params.id);
  return success(res, { entries }, 'Shortlist fetched');
});

const addToShortlist = asyncHandler(async (req, res) => {
  const { entry, lead } = await shortlistService.add({
    leadId: req.params.id,
    universityId: req.params.universityId,
    req,
  });
  return success(res, { entry, lead }, 'University added to shortlist');
});

const updateShortlistEntry = asyncHandler(async (req, res) => {
  const entry = await shortlistService.updateEntry({
    leadId: req.params.id,
    universityId: req.params.universityId,
    payload: req.body ?? {},
    req,
  });
  return success(res, { entry }, 'Shortlist updated');
});

const removeFromShortlist = asyncHandler(async (req, res) => {
  const entry = await shortlistService.remove({
    leadId: req.params.id,
    universityId: req.params.universityId,
    req,
  });
  return success(res, { entry }, 'Removed from shortlist');
});

const confirmShortlist = asyncHandler(async (req, res) => {
  const { entries, confirmedCount, lead } = await shortlistService.confirm({
    leadId: req.params.id,
    req,
  });
  return success(res, { entries, confirmedCount, lead }, 'Shortlist confirmed');
});

module.exports = {
  getShortlist,
  addToShortlist,
  updateShortlistEntry,
  removeFromShortlist,
  confirmShortlist,
};
