const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const { reviveLead } = require('../services/leadDrop.service');

/**
 * POST /api/leads/:id/revive  (Agent / Counselor / Supervisor)
 * Bring a dropped lead back to the active queue; requires a reason.
 * Restores the pre-drop working status + disposition from the lead's own
 * snapshot and clears the drop marker. History is never reset.
 */
const reviveLeadAction = asyncHandler(async (req, res) => {
  const lead = await reviveLead({
    leadId: req.params.id,
    actor: req.user,
    roleName: req.role?.name,
    roleCode: req.role?.code,
    reason: req.body?.reason,
  });
  return success(
    res,
    { lead, dropStatus: lead.dropStatus, dropHistory: lead.dropHistory || [] },
    'Lead revived — back in the active queue'
  );
});

module.exports = {
  reviveLeadAction,
};