import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DoneIcon from '@mui/icons-material/Done';
import { fetchWhatsappChatHistory } from '../api/whatsappChatHistory.js';

/* ==========================================================================
   WHATSAPP CONVERSATION — read-only message history for the WhatsApp
   sidebar's "Conversation" tab. Body-only (no header, no student
   selection — identity comes from the `studentId` prop, same lead already
   loaded in the workspace).

   Deliberately separate from WhatsAppTemplateComposer: this depends only on
   `fetchWhatsappChatHistory` (its own data source, currently a stub with no
   backend yet); Templates depends only on the existing whatsapp.js API.
   Neither ever calls into the other.
   ========================================================================== */

const fmtTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Delivery/read indicator — outgoing messages only, purely presentational.
const StatusTick = ({ status }) => {
  const s = String(status || '').toLowerCase();
  if (s === 'read') return <DoneAllIcon sx={{ fontSize: 13, color: 'success.main' }} />;
  if (s === 'delivered') return <DoneAllIcon sx={{ fontSize: 13, color: 'text.disabled' }} />;
  if (s === 'sent') return <DoneIcon sx={{ fontSize: 13, color: 'text.disabled' }} />;
  return null;
};

// One compact message bubble. Pure presentational — knows nothing about
// where `message` came from, so swapping the fetch for a real API later
// requires no change here.
const ChatBubble = ({ message }) => {
  const outgoing = message.direction === 'outgoing';
  return (
    <Box sx={{ display: 'flex', justifyContent: outgoing ? 'flex-end' : 'flex-start', px: 1.5 }}>
      <Box
        sx={{
          maxWidth: '82%',
          bgcolor: outgoing ? 'success.soft' : 'action.hover',
          border: '1px solid',
          borderColor: outgoing ? 'success.border' : 'divider',
          borderRadius: 2,
          ...(outgoing ? { borderTopRightRadius: 3 } : { borderTopLeftRadius: 3 }),
          px: 1.5,
          py: 1,
        }}
      >
        <Typography sx={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.primary' }}>
          {message.message}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>{fmtTime(message.timestamp)}</Typography>
          {outgoing && <StatusTick status={message.status} />}
        </Box>
      </Box>
    </Box>
  );
};

export default function WhatsAppConversation({ studentId, active }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active || !studentId) return;
    let cancelled = false;
    setLoading(true);
    fetchWhatsappChatHistory(studentId)
      .then((list) => { if (!cancelled) setMessages(list || []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active, studentId]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', py: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {loading ? null : messages.length === 0 ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ fontSize: 15, mb: 0.5 }}>No WhatsApp history</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5 }}>
              WhatsApp conversation history for this student will appear here once messaging history is available.
            </Typography>
          </Box>
        </Box>
      ) : (
        messages.map((m) => <ChatBubble key={m.id} message={m} />)
      )}
    </Box>
  );
}
