import AccountsManager from '@/components/AccountsManager';

export const metadata = { title: 'Lead Mailboxes · Email Warm-Up' };

export default function LeadAccountsPage() {
  return (
    <AccountsManager
      kind="lead"
      title="Lead Mailboxes"
      description="Responder inboxes (typically Gmail with an App Password) that receive warm-up emails and reply automatically."
      addLabel="Add lead mailbox"
    />
  );
}
