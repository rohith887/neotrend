const workqueueService = require('../services/workqueue.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');

const getWorkQueue = asyncHandler(async (req, res) => {
  const data = await workqueueService.getWorkQueue(req.user._id);
  return success(res, data, 'Work queue fetched');
});


const reschedule = asyncHandler(async (req, res) => {
  const data = await workqueueService.rescheduleCallback(req.user._id, req.body);
  return success(res, data, 'Callback rescheduled');
});


const complete = asyncHandler(async (req, res) => {
  const data = await workqueueService.completeCallback(req.user._id, req.body);
  return success(res, data, 'Callback completed');
});

module.exports = { getWorkQueue, reschedule, complete };
