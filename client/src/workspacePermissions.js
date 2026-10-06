export const workspacePermissions = (role) => {
  const isSupervisor = role === 'supervisor';

  return {
    isSupervisor,
    isAgent: role === 'agent',
    canEditStudent: isSupervisor || role === 'agent' || role === 'counselor',
    canAddRemarks: isSupervisor || role === 'agent' || role === 'counselor',
    canPerformCallActions: role === 'agent',
    canSubmitDisposition: role === 'agent',
    canManageShortlist: isSupervisor || role === 'agent',
  };
};
