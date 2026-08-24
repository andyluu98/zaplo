/**
 * facebook-page-view.tsx — "Facebook Page" nav screen.
 *
 * Day-to-day management surface for the Page channel: connected-Page list
 * (enable/disable, disclosure, disconnect — page-list.tsx), webhook exposure
 * status (page-webhook-panel.tsx), and the connect flow. Connect is NOT rebuilt
 * here — it embeds the existing `FacebookPageWizard` (already a full 3-step
 * app-registration + OAuth + connect flow, used by the Integration tab too).
 */

import React from 'react';
import FacebookPageWizard from '../integration/FacebookPageWizard';
import PageList from './page-list';
import PageWebhookPanel from './page-webhook-panel';

export default function FacebookPageView() {
  return (
    <div className="h-full overflow-y-auto bg-gray-900">
      <div className="px-6 py-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-base font-semibold text-white flex items-center gap-2">📘 Facebook Page</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Quản lý Page đã kết nối, webhook nhận tin Messenger, và agent AI tự trả lời khách.
          </p>
        </div>

        <PageList />
        <PageWebhookPanel />

        {/* Connect flow — reused as-is, not duplicated. */}
        <FacebookPageWizard />
      </div>
    </div>
  );
}
