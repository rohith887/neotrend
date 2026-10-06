import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { AgentProvider } from './context/AgentContext.jsx';
import SignIn from './pages/SignIn.jsx';
import PublicReferralPage from './pages/PublicReferralPage.jsx';
import PublicCommonReferralPage from './pages/PublicCommonReferralPage.jsx';
import PublicQRReferralPage from './pages/PublicQRReferralPage.jsx';
import WhatsAppStudentForm from './pages/WhatsAppStudentForm.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import Layout from './components/Layout.jsx';
import CallNavigationGuard from './components/CallNavigationGuard.jsx';

function AgentLayout() {
  return (
    <AgentProvider key={useAuth().user?._id}>
      {/* Blocks in-app route changes + page unload while a call is live. */}
      <CallNavigationGuard />
      <PrivateRoute roles={['agent']}><Layout /></PrivateRoute>
    </AgentProvider>
  );
}

export default function App() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return null;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/refer" element={<PublicQRReferralPage />} />
        <Route path="/refer/emp/:userId" element={<PublicCommonReferralPage />} />
        <Route path="/refer/:referralCode" element={<PublicReferralPage />} />
        <Route path="/whatsapp/student" element={<WhatsAppStudentForm />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    );
  }

  const role = user.role?.code || user.role;
  const defaultPath = role === 'counselor' ? '/counselor/workspace' : role === 'agent' ? '/agent/dashboard' : '/dashboard';

  return (
    <Routes>
      <Route path="/refer" element={<PublicQRReferralPage />} />
      <Route path="/refer/emp/:userId" element={<PublicCommonReferralPage />} />
      <Route path="/refer/:referralCode" element={<PublicReferralPage />} />
      <Route path="/whatsapp/student" element={<WhatsAppStudentForm />} />
      <Route path="/signin" element={<Navigate to={defaultPath} replace />} />

      {/* Supervisor routes */}
      <Route path="/" element={<PrivateRoute roles={['supervisor']}><Layout /></PrivateRoute>}>
        <Route path="dashboard" element={null} />
        <Route path="reports" element={null} />
        <Route path="reports/advisor-performance" element={null} />
        <Route path="reports/lead-conversion" element={null} />
        <Route path="reports/call-analytics" element={null} />
        <Route path="reports/break-report" element={null} />
        <Route path="reports/activity-report" element={null} />
        <Route path="reports/quality-scores" element={null} />
        <Route path="reports/time-share" element={null} />
        <Route path="users" element={null} />
        <Route path="leads" element={null} />
        <Route path="leads/:leadId" element={null} />
        <Route path="referrals" element={null} />
        <Route path="universities" element={null} />
        <Route path="system-logs" element={null} />
        <Route path="alerts" element={null} />
      </Route>

      {/* Counselor routes */}
      <Route path="/counselor" element={<PrivateRoute roles={['counselor']}><Layout /></PrivateRoute>}>
        <Route path="workspace" element={null} />
        <Route path="alerts" element={null} />
        <Route path="students" element={null} />
        <Route path="follow-ups" element={null} />
        <Route path="counseling" element={null} />
        <Route path="applications" element={null} />
        <Route path="registration" element={null} />
        <Route path="documents" element={null} />
        <Route path="payments" element={null} />
        <Route path="visa-process" element={null} />
        <Route path="reports" element={null} />
      </Route>

      {/* Agent routes — AgentProvider only wraps agent-specific routes */}
      <Route path="/agent" element={<AgentLayout />}>
        <Route path="dashboard" element={null} />
        <Route path="workspace" element={null} />
        <Route path="alerts" element={null} />
      </Route>

      <Route path="*" element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}
