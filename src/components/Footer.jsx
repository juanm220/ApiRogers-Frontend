import React from 'react';
import '../styles.css';

function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="site-footer safe-pads"
      role="contentinfo"
      aria-label="Footer"
    >
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="brand-mark" aria-hidden="true" />
          <strong>Hawking Quick Service</strong>
          <span className="dot" aria-hidden="true">•</span>
          <span>Department Tool Prototype</span>
        </div>

        <p className="footer-quote">
          “From sparks to signals to stars—onward. Hicimos del problema un faro”
          <span className="quote-src"> — Black Sails</span>
        </p>

        <div className="footer-meta">
          <span>Developer: Juan C</span>
          <span className="sep">|</span>
          <span>© {year} All rights reserved</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
