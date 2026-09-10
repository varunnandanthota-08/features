export default function HomePage() {
  return (
    <section className="home-page" aria-labelledby="home-title">
      <p className="eyebrow">Rural care network</p>
      <h1 id="home-title">Operations workspace</h1>
      <p className="intro">
        The frontend foundation is ready for connected patient, case, emergency, and health-centre workflows.
      </p>
      <div className="foundation-grid">
        <article className="foundation-panel">
          <span className="panel-index">01</span>
          <h2>One workspace</h2>
          <p>Shared navigation and layout for the workflows that will be added next.</p>
        </article>
        <article className="foundation-panel accent-panel">
          <span className="panel-index">02</span>
          <h2>Backend-ready</h2>
          <p>API requests are centralized and configured through the frontend environment.</p>
        </article>
        <article className="foundation-panel">
          <span className="panel-index">03</span>
          <h2>Feature by feature</h2>
          <p>Placeholder routes keep the shell ready without adding business behavior yet.</p>
        </article>
      </div>
    </section>
  );
}
