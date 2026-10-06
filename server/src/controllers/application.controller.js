const applicationService = require('../services/application.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');

/* Application workflow — all access is enforced inside the service
   (supervisor or the assigned/fetching user of the owning lead). */

const listApplications = asyncHandler(async (req, res) => {
  const result = await applicationService.listForLead({
    leadId: req.params.id,
    query: req.query ?? {},
  });
  return success(res, result, 'Applications fetched');
});

const createApplication = asyncHandler(async (req, res) => {
  const { application, lead } = await applicationService.create({
    leadId: req.params.id,
    shortlistId: req.body?.shortlistId,
    req,
  });
  return success(res, { application, lead }, 'Application created', 201);
});

const getApplication = asyncHandler(async (req, res) => {
  const application = await applicationService.getById({
    applicationId: req.params.applicationId,
    req,
  });
  return success(res, { application }, 'Application fetched');
});

const updateApplication = asyncHandler(async (req, res) => {
  const { application, lead } = await applicationService.updateStatus({
    applicationId: req.params.applicationId,
    payload: req.body ?? {},
    req,
  });
  return success(res, { application, lead }, 'Application updated');
});

const submitApplication = asyncHandler(async (req, res) => {
  const { application, lead } = await applicationService.submit({
    applicationId: req.params.applicationId,
    req,
  });
  return success(res, { application, lead }, 'Application submitted');
});

const withdrawApplication = asyncHandler(async (req, res) => {
  const { application, lead } = await applicationService.withdraw({
    applicationId: req.params.applicationId,
    payload: req.body ?? {},
    req,
  });
  return success(res, { application, lead }, 'Application withdrawn');
});

const getApplicationTimeline = asyncHandler(async (req, res) => {
  const result = await applicationService.getTimeline({
    applicationId: req.params.applicationId,
    req,
  });
  return success(res, result, 'Application timeline fetched');
});

const getApplicationsOverview = asyncHandler(async (req, res) => {
  const result = await applicationService.overview({
    query: req.query ?? {},
    req,
  });
  return success(res, result, 'Applications overview fetched');
});

module.exports = {
  listApplications,
  createApplication,
  getApplication,
  updateApplication,
  submitApplication,
  withdrawApplication,
  getApplicationTimeline,
  getApplicationsOverview,
};
