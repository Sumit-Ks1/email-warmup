import AccountsManager from '@/components/AccountsManager';

export const metadata = { title: 'Domain Mailboxes · Email Warm-Up' };

export default function DomainAccountsPage() {
  return (
    <AccountsManager
      kind="domain"
      title="Domain Mailboxes"
      description="The custom-domain mailboxes you are warming up. Credentials are encrypted before storage and never leave the server."
      addLabel="Add domain mailbox"
    />
  );
}
