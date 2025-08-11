
async function sendEmail({ to, subject, text, html }) {
  // Note: c.env is not available here directly.
  // This function should be called with the env object.
  // Let's refactor to pass env in.
  throw new Error("sendEmail function was called without env. This should not happen.");
}

export async function sendEmailWithMailgun(env, { to, subject, text, html }) {
  const { MAILGUN_API_KEY, MAILGUN_DOMAIN, MAIL_FROM } = env;

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !MAIL_FROM) {
    console.error("Mailgun environment variables are not set. Email not sent.");
    // In a real app, you might want to throw an error or handle this more gracefully.
    return { success: false, error: "Email service is not configured." };
  }

  const endpoint = `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`;

  const formData = new URLSearchParams();
  formData.append('from', `Open Spaces Live <${MAIL_FROM}>`);
  formData.append('to', to);
  formData.append('subject', subject);
  if (text) formData.append('text', text);
  if (html) formData.append('html', html);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
      },
      body: formData,
    });

    const responseBody = await response.json();

    if (!response.ok) {
      console.error('Failed to send email:', responseBody);
      return { success: false, error: responseBody.message || 'Failed to send email' };
    }

    console.log('Email sent successfully:', responseBody);
    return { success: true, data: responseBody };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}
