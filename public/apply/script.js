(function () {
  const form = document.getElementById('apply-form');
  const submitBtn = document.getElementById('submit-btn');

  const dateInput = document.getElementById('visit-date');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.min = `${yyyy}-${mm}-${dd}`;
  }

  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoading = submitBtn.querySelector('.btn-loading');
  const successPanel = document.getElementById('success-panel');
  const errorPanel = document.getElementById('error-panel');
  const retryBtn = document.getElementById('retry-btn');

  function setLoading(loading) {
    submitBtn.disabled = loading;
    btnText.hidden = loading;
    btnLoading.hidden = !loading;
  }

  function markError(field, on) {
    const wrap = field.closest('.field');
    if (wrap) wrap.classList.toggle('has-error', !!on);
  }

  function validate(data) {
    const errors = [];
    const requiredText = ['instagram', 'followers', 'visitDate', 'contact', 'country'];
    for (const key of requiredText) {
      if (!data[key] || !data[key].trim()) {
        errors.push(key);
        const el = form.querySelector(`[name="${key}"]`);
        if (el) markError(el, true);
      } else {
        const el = form.querySelector(`[name="${key}"]`);
        if (el) markError(el, false);
      }
    }
    ['gifted', 'upload', 'repost'].forEach((k) => {
      if (!data[k]) {
        errors.push(k);
        const first = form.querySelector(`[name="${k}"]`);
        if (first) markError(first, true);
      } else {
        const first = form.querySelector(`[name="${k}"]`);
        if (first) markError(first, false);
      }
    });
    if (!data.category || data.category.length === 0) {
      errors.push('category');
      const first = form.querySelector('[name="category"]');
      if (first) markError(first, true);
    } else {
      const first = form.querySelector('[name="category"]');
      if (first) markError(first, false);
    }
    return errors;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fd = new FormData(form);
    const data = {
      instagram: fd.get('instagram'),
      followers: fd.get('followers'),
      gifted: fd.get('gifted'),
      visitDate: fd.get('visitDate'),
      contact: fd.get('contact'),
      category: fd.getAll('category'),
      country: fd.get('country'),
      upload: fd.get('upload'),
      repost: fd.get('repost'),
      health: fd.get('health') || '',
    };

    const errors = validate(data);
    if (errors.length) {
      const firstEl = form.querySelector('.has-error');
      if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setLoading(true);
    errorPanel.hidden = true;

    try {
      const res = await fetch('/api/apply/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Submission failed');
      }

      form.hidden = true;
      successPanel.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      errorPanel.hidden = false;
      errorPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      setLoading(false);
    }
  });

  retryBtn.addEventListener('click', () => {
    errorPanel.hidden = true;
  });

  const videoEl = document.getElementById('intro-video');
  const soundBtn = document.getElementById('video-sound');
  if (videoEl && soundBtn) {
    const iconEl = soundBtn.querySelector('.sound-icon');
    soundBtn.addEventListener('click', () => {
      videoEl.muted = !videoEl.muted;
      iconEl.textContent = videoEl.muted ? '🔇' : '🔊';
      iconEl.dataset.state = videoEl.muted ? 'muted' : 'on';
      if (!videoEl.muted) videoEl.play().catch(() => {});
    });
  }
})();
