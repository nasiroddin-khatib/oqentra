/*
 * OQENTRA PUBLIC WEBSITE INTERACTIONS
 * ------------------------------------------------------------------
 * Owns navigation, form UX, enquiry/referral submissions, carousel
 * behaviour, scroll reveals and small progressive enhancements.
 * Business data is sent through js/api.js; no private credentials live here.
 */
import { submitEnquiry, submitReferral } from "./api.js";

const config = window.OQENTRA_CONFIG || {};

/** Finds an element by its stable HTML id. */
function byId(id) {
  return document.getElementById(id);
}

/**
 * Shows a short-lived toast for general interaction feedback.
 * Form-specific errors remain next to their corresponding form.
 */
function showToast(message, type = "success") {
  const region = byId("toastRegion");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " error" : ""}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

/** Updates a form's accessible status text and visual state. */
function setFormStatus(element, message, state = "info") {
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
}

/**
 * Toggles the mobile navigation and keeps aria-expanded in sync.
 * The navigation is closed after a link is selected or Escape is pressed.
 */
function initializeNavigation() {
  const toggle = byId("menuToggle");
  const nav = byId("primaryNav");
  if (!toggle || !nav) return;

  const closeMenu = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
  };

  toggle.addEventListener("click", () => {
    const willOpen = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(willOpen));
    toggle.setAttribute("aria-label", willOpen ? "Close navigation" : "Open navigation");
    nav.classList.toggle("is-open", willOpen);
  });

  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) closeMenu();
  });
}

/**
 * Prefills the enquiry form when a service or management plan is selected.
 * The form remains optional; this only saves the customer from retyping context.
 */
function initializeEnquiryShortcuts() {
  document.querySelectorAll("[data-service], [data-plan]").forEach((link) => {
    link.addEventListener("click", () => {
      const serviceSelect = byId("contactService");
      const messageField = byId("contactMessage");
      if (link.dataset.service && serviceSelect) {
        const option = Array.from(serviceSelect.options).find((item) => item.value === link.dataset.service || item.textContent === link.dataset.service);
        if (option) serviceSelect.value = option.value;
      }
      if (link.dataset.plan && messageField) {
        messageField.value = `I'm interested in the ${link.dataset.plan} option. Please help me understand the final scope and quotation.`;
      }
    });
  });
}

/**
 * Applies a pending/loading state to a form submit button and restores it later.
 * This prevents duplicate submissions while a request is in progress.
 */
function setSubmitButtonState(button, isLoading, loadingText) {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

/**
 * Combines optional business context with the customer's project description.
 * The current backend enquiry schema stores this in the message field.
 */
function buildEnquiryPayload(form) {
  const formData = new FormData(form);
  const businessName = String(formData.get("business_name") || "").trim();
  const originalMessage = String(formData.get("message") || "").trim();
  const message = businessName
    ? `Business / brand: ${businessName}\n\nProject details:\n${originalMessage}`
    : originalMessage;

  return {
    name: String(formData.get("name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    service: String(formData.get("service") || "").trim(),
    message
  };
}

/**
 * Handles the public project enquiry form, validates consent and posts to API.
 * Displays a reference number when the backend confirms that it saved the lead.
 */
function initializeEnquiryForm() {
  const form = byId("contactForm");
  const status = byId("contactStatus");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    // Honeypot field is hidden from people; filled values are treated as spam.
    if (String(new FormData(form).get("website") || "").trim()) {
      form.reset();
      setFormStatus(status, "Thank you. Your enquiry has been received.", "success");
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    setSubmitButtonState(button, true, "Sending enquiry…");
    setFormStatus(status, "Sending your enquiry…", "info");

    try {
      const result = await submitEnquiry(buildEnquiryPayload(form));
      const reference = result.id ? `OQ-ENQ-${result.id}` : "confirmed";
      form.reset();
      setFormStatus(status, `Thank you. Your enquiry has been received. Reference: ${reference}. We'll follow up using your contact details.`, "success");
      showToast("Your project enquiry was submitted.");
    } catch (error) {
      setFormStatus(status, `${error.message} Your form has not been confirmed as submitted. Please try again.`, "error");
      showToast("We couldn't submit your enquiry.", "error");
    } finally {
      setSubmitButtonState(button, false);
    }
  });
}

/**
 * Handles the referral form and displays the unique referral code from backend.
 * Referrers are reminded to obtain permission before sharing another person's data.
 */
function initializeReferralForm() {
  const form = byId("referralForm");
  const status = byId("referralStatus");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    // Honeypot spam trap: do not send bot-filled forms to the backend.
    if (String(new FormData(form).get("website") || "").trim()) {
      form.reset();
      setFormStatus(status, "Thank you. Your referral has been received.", "success");
      return;
    }

    const formData = new FormData(form);
    const payload = {
      referrer_name: String(formData.get("referrer_name") || "").trim(),
      referrer_phone: String(formData.get("referrer_phone") || "").trim(),
      referred_name: String(formData.get("referred_name") || "").trim(),
      referred_phone: String(formData.get("referred_phone") || "").trim(),
      service: String(formData.get("service") || "").trim(),
      message: String(formData.get("message") || "").trim()
    };

    const button = form.querySelector('button[type="submit"]');
    setSubmitButtonState(button, true, "Submitting referral…");
    setFormStatus(status, "Submitting the referral…", "info");

    try {
      const result = await submitReferral(payload);
      form.reset();
      const code = result.referral_code ? ` Your reference code is ${result.referral_code}.` : "";
      setFormStatus(status, `Thank you. Your referral was submitted.${code}`, "success");
      showToast("Your referral was submitted.");
    } catch (error) {
      setFormStatus(status, `${error.message} Your referral has not been confirmed as submitted. Please try again.`, "error");
      showToast("We couldn't submit the referral.", "error");
    } finally {
      setSubmitButtonState(button, false);
    }
  });
}

/**
 * Initializes the selected-work carousel with arrows, touch gestures and
 * automatic advancement every three seconds. Motion pauses on hover, focus,
 * touch interaction, hidden tabs and reduced-motion preferences.
 */
function initializeWorkSlider() {
  const shell = document.querySelector('[data-slider="work"]');
  if (!shell) return;
  const track = shell.querySelector(".work-track");
  const cards = Array.from(track.children);
  const previous = shell.querySelector("[data-prev]");
  const next = shell.querySelector("[data-next]");
  const count = shell.querySelector(".slider-count");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let index = 0;
  let timer = null;
  let touchStartX = 0;

  const visibleCount = () => window.matchMedia("(max-width: 620px)").matches ? 1 : 2;
  const maximumIndex = () => Math.max(0, cards.length - visibleCount());

  /** Moves the carousel to a valid slide index and updates its counter. */
  const goTo = (nextIndex) => {
    index = nextIndex > maximumIndex() ? 0 : nextIndex < 0 ? maximumIndex() : nextIndex;
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0;
    const cardWidth = cards[0]?.getBoundingClientRect().width || 0;
    track.style.transform = `translate3d(${-index * (cardWidth + gap)}px, 0, 0)`;
    if (count) count.textContent = `${String(index + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;
    if (previous) previous.disabled = maximumIndex() === 0;
    if (next) next.disabled = maximumIndex() === 0;
  };

  /** Starts or restarts the three-second auto-advance timer. */
  const startTimer = () => {
    window.clearInterval(timer);
    if (reducedMotion.matches || document.hidden || maximumIndex() === 0) return;
    timer = window.setInterval(() => goTo(index + 1), 3000);
  };

  /** Stops the auto-advance timer during user interaction. */
  const stopTimer = () => window.clearInterval(timer);

  previous?.addEventListener("click", () => { goTo(index - 1); startTimer(); });
  next?.addEventListener("click", () => { goTo(index + 1); startTimer(); });
  shell.addEventListener("mouseenter", stopTimer);
  shell.addEventListener("mouseleave", startTimer);
  shell.addEventListener("focusin", stopTimer);
  shell.addEventListener("focusout", startTimer);
  shell.addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0].clientX; stopTimer(); }, { passive: true });
  shell.addEventListener("touchend", (event) => {
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 45) goTo(index + (distance < 0 ? 1 : -1));
    startTimer();
  }, { passive: true });
  document.addEventListener("visibilitychange", () => document.hidden ? stopTimer() : startTimer());
  reducedMotion.addEventListener?.("change", startTimer);
  window.addEventListener("resize", () => goTo(Math.min(index, maximumIndex())));

  goTo(0);
  startTimer();
}

/**
 * Reveals content as it enters the viewport. If IntersectionObserver is not
 * available, all content remains visible rather than disappearing.
 */
function initializeScrollReveal() {
  const elements = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("js-reveal");
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -35px 0px" });
  elements.forEach((element) => observer.observe(element));
}

/**
 * Exposes optional WhatsApp/email links only after the owner configures them.
 * Prevents the public website from showing invented contact details.
 */
function initializeContactChannels() {
  const whatsappLink = byId("whatsappLink");
  const number = String(config.WHATSAPP_NUMBER || "").replace(/\D/g, "");
  if (whatsappLink && number) {
    whatsappLink.href = `https://wa.me/${number}`;
    whatsappLink.target = "_blank";
    whatsappLink.rel = "noopener noreferrer";
    whatsappLink.classList.remove("is-hidden");
  }

  const emailText = byId("contactEmailText");
  const email = String(config.PUBLIC_EMAIL || "").trim();
  if (emailText && email) {
    const emailLink = document.createElement("a");
    emailLink.className = "text-link";
    emailLink.href = `mailto:${email}`;
    emailLink.textContent = email;
    emailText.replaceWith(emailLink);
  }
}

/** Sets the current year in the footer without manual annual edits. */
function initializeFooterYear() {
  const year = byId("currentYear");
  if (year) year.textContent = String(new Date().getFullYear());
}

/**
 * Highlights the current section in the desktop navigation for orientation.
 * This is a progressive enhancement; normal anchor navigation still works.
 */
function initializeActiveNavigation() {
  if (!("IntersectionObserver" in window)) return;
  const sections = document.querySelectorAll("main section[id]");
  const links = Array.from(document.querySelectorAll(".primary-nav a"));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((link) => {
        if (link.getAttribute("href") === `#${entry.target.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-25% 0px -65% 0px" });
  sections.forEach((section) => observer.observe(section));
}

/* Initialize all page features after the module has loaded. */
initializeNavigation();
initializeEnquiryShortcuts();
initializeEnquiryForm();
initializeReferralForm();
initializeWorkSlider();
initializeScrollReveal();
initializeContactChannels();
initializeFooterYear();
initializeActiveNavigation();
