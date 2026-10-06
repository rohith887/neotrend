import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import GlossyActionButton from '../ui/mui/GlossyActionButton.jsx';

const WA_GREEN = '#25D366';

export default function WhatsAppActionButton({ onClick, label = 'WhatsApp' }) {
  return (
    <GlossyActionButton
      icon={<WhatsAppIcon sx={{ fontSize: 15 }} />}
      label={label}
      color={WA_GREEN}
      onClick={onClick}
      title="Send a WhatsApp template message to this student"
    />
  );
}
