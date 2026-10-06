const dispositionService = require('../services/disposition.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');

const listDispositions = asyncHandler(async (req, res) => {
  const data = await dispositionService.listDispositions();
  return success(res, data, 'Dispositions fetched');
});

const listInterestLevels = asyncHandler(async (req, res) => {
  const data = dispositionService.listInterestLevels();
  return success(res, data, 'Interest levels fetched');
});

module.exports = { listDispositions, listInterestLevels };
