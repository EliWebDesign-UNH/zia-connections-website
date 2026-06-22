// Zia Connections — Frontend script
// Handles: mobile nav, contact form submission, year stamp

(function() {
  // Year stamp
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen);
    });
    // Close on link click
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        links.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Contact form submission (Web3Forms)
  const form = document.getElementById('contactForm');
  if (form) {
    // Dynamically set subject + replyto from user input
    const businessInput = form.querySelector('#business');
    const emailInput = form.querySelector('#email');
    const subjectInput = form.querySelector('input[name="subject"]');
    const replytoInput = form.querySelector('input[name="replyto"]');
    if (businessInput && subjectInput) {
      businessInput.addEventListener('input', () => {
        subjectInput.value = `New Lead from ZiaConnections.com — ${businessInput.value || 'New Business'}`;
      });
    }
    if (emailInput && replytoInput) {
      emailInput.addEventListener('input', () => {
        replytoInput.value = emailInput.value;
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        const formData = new FormData(form);
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          form.innerHTML = '<div style="text-align:center;padding:2rem;"><h3 style="color:var(--color-primary);margin-bottom:1rem;">Thanks! We got it.</h3><p style="color:var(--color-text-muted);">Check your inbox — your free audit is on its way. We\'ll be in touch within 1 business day.</p></div>';
        } else {
          throw new Error(data.message || 'Submission failed');
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = original;
        alert('Something went wrong. Email us directly at hello@ziaconnections.com');
      }
    });
  }

  // Smooth scroll for hash links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length > 1) {
        const target = document.querySelector(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });
})();
