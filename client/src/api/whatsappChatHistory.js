// WhatsApp chat-history data layer — deliberately separated from the
// ChatHistory UI so the real API can be wired in later without touching any
// rendering code. No backend endpoint exists yet, so this simply resolves an
// empty list; the shape it will eventually resolve is:
//   { id, studentId, direction: 'incoming' | 'outgoing', message, timestamp, status }[]
export const fetchWhatsappChatHistory = async (_studentId) => [];
