export default function LoadingState({ className }: { className?: string }) {
  return (
    <div className={className} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Loading...</div>
    </div>
  );
}
