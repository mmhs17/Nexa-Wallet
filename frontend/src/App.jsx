import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import TwoFAVerify from "./pages/TwoFAVerify.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Wallet from "./pages/Wallet.jsx";
import SendMoney from "./pages/SendMoney.jsx";
import ReceiveMoney from "./pages/ReceiveMoney.jsx";
import AddMoney from "./pages/AddMoney.jsx";
import RequestMoney from "./pages/RequestMoney.jsx";
import Transactions from "./pages/Transactions.jsx";
import TransactionDetail from "./pages/TransactionDetail.jsx";
import FraudAlerts from "./pages/FraudAlerts.jsx";
import RiskHistory from "./pages/RiskHistory.jsx";
import SecurityCenter from "./pages/SecurityCenter.jsx";
import Privacy from "./pages/Privacy.jsx";
import Notifications from "./pages/Notifications.jsx";
import Beneficiaries from "./pages/Beneficiaries.jsx";
import Requests from "./pages/Requests.jsx";
import RecurringPayments from "./pages/RecurringPayments.jsx";
import PrivacySettings from "./pages/PrivacySettings.jsx";
import Analytics from "./pages/Analytics.jsx";
import Intelligence from "./pages/Intelligence.jsx";
import Admin from "./pages/Admin.jsx";

function RootRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-8 text-slate-400">Loading NEXA Wallet…</div>;
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public pages */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/2fa/verify" element={<TwoFAVerify />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          {/* Protected routes */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/send" element={<SendMoney />} />
            <Route path="/receive" element={<ReceiveMoney />} />
            <Route path="/add-money" element={<AddMoney />} />
            <Route path="/request-money" element={<RequestMoney />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/transactions/:id" element={<TransactionDetail />} />
            <Route path="/fraud/alerts" element={<FraudAlerts />} />
            <Route path="/fraud/history" element={<RiskHistory />} />
            <Route path="/security" element={<SecurityCenter />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/privacy/settings" element={<PrivacySettings />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/beneficiaries" element={<Beneficiaries />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/recurring" element={<RecurringPayments />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
