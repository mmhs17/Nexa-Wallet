/**
 * NEXA Wallet — Notifications Page
 * Pay Smart. Stay Protected.
 */

import { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { fmtDate } from "../utils/format.js";
import { PageHeader } from "../components/ui.jsx";

export default function Notifications() {
  const { user } = useAuth();
  const [lockFlash, setLockFlash] = useOutletContext();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/notifications?limit=50");
      const d = unwrap(res) || {};
      setNotifications(d.items || []);
      setUnread(d.unreadCount ?? (d.items || []).filter(n => !n.isRead).length);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAsRead = async (notificationId) => {
    try {
      await api.post(`/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
    } catch (e) {
      setError(apiError(e));
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post("/notifications/read-all");
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnread(0);
      setLockFlash("All notifications marked as read");
    } catch (e) {
      setError(apiError(e));
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "PAYMENT_RECEIVED": return "💰";
      case "PAYMENT_SENT": return "➤";
      case "PAYMENT_FAILED": return "❌";
      case "PAYMENT_BLOCKED": return "🚫";
      case "FRAUD_ALERT": return "⚠️";
      case "NEW_LOGIN": return "🔐";
      case "WALLET_FREEZE": return "❄️";
      default: return "📢";
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case "PAYMENT_RECEIVED": return "bg-emerald-500/20 text-emerald-300";
      case "PAYMENT_SENT": return "bg-sky-500/20 text-sky-300";
      case "PAYMENT_FAILED": return "bg-rose-500/20 text-rose-300";
      case "PAYMENT_BLOCKED": return "bg-rose-500/20 text-rose-300";
      case "FRAUD_ALERT": return "bg-amber-500/20 text-amber-300";
      case "WALLET_FREEZE": return "bg-rose-500/20 text-rose-300";
      default: return "bg-slate-500/20 text-slate-300";
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === "unread") return !n.isRead;
    if (filter === "read") return n.isRead;
    return true;
  });

  const unreadCount = unread || notifications.filter(n => !n.isRead).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-400">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Notifications" 
        subtitle={`${unreadCount} unread`}
      />
      {/* Filters */}
      <div className="flex gap-2">
        {["all", "unread", "read"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${
              filter === f 
                ? "bg-nexa-500/20 text-nexa-300" 
                : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Actions */}
      {unreadCount > 0 && (
        <button
          onClick={markAllAsRead}
          className="btn-ghost text-sm"
        >
          Mark all as read
        </button>
      )}

      {/* Notification List */}
      {filteredNotifications.length === 0 ? (
        <div className="card !p-6 text-center">
          <div className="text-4xl mb-3">🔔</div>
          <h3 className="font-display text-lg font-bold text-white">No notifications</h3>
          <p className="text-sm text-slate-400 mt-1">
            You're all caught up!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`card !p-4 cursor-pointer transition hover:bg-white/[0.03] ${
                !notification.isRead ? "!border-l-2 !border-l-nexa-500" : ""
              }`}
              onClick={() => !notification.isRead && markAsRead(notification.id)}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                  getNotificationColor(notification.type)
                }`}>
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className={`text-sm font-medium ${
                      notification.isRead ? "text-slate-300" : "text-white"
                    }`}>
                      {notification.title}
                    </h4>
                    <span className="text-xs text-slate-500">
                      {fmtDate(notification.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    {notification.message}
                  </p>
                </div>
                {!notification.isRead && (
                  <div className="w-2 h-2 rounded-full bg-nexa-500 mt-2 flex-shrink-0"></div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
