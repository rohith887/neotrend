import client from './client.js';

// Single shared identity source for @mention autocomplete — Active
// Agent / Counselor / Supervisor users (same list for every workspace).
export const fetchMentionableUsers = () =>
  client.get('/users/mentionable').then(({ data }) => data.data ?? []);