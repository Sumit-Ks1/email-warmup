/**
 * SMTP Email Sending Service.
 * 
 * Uses Nodemailer for sending emails with proper threading headers.
 * Generates RFC-compliant Message-ID and sets In-Reply-To for threading.
 */

import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  password: string;
  email: string;
  senderName: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string; // For threading: references the original Message-ID
  references?: string; // Full reference chain for threading
}

interface SendEmailResult {
  messageId: string;
  accepted: string[];
}

/**
 * Create a Nodemailer transporter with given SMTP configuration.
 */
function createTransporter(config: SmtpConfig) {
  const options: SMTPTransport.Options = {
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.email,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 30000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  };
  return nodemailer.createTransport(options);
}

/**
 * Send an email via SMTP with proper threading headers.
 */
export async function sendEmail(
  smtpConfig: SmtpConfig,
  params: SendEmailParams
): Promise<SendEmailResult> {
  const transporter = createTransporter(smtpConfig);

  // Generate a unique Message-ID
  const domain = smtpConfig.email.split('@')[1];
  const messageId = `<${uuidv4()}@${domain}>`;

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"${smtpConfig.senderName}" <${smtpConfig.email}>`,
    to: params.to,
    subject: params.subject,
    text: params.body,
    messageId: messageId,
    headers: {} as Record<string, string>,
  };

  // Add threading headers if this is a reply
  if (params.inReplyTo) {
    (mailOptions.headers as Record<string, string>)['In-Reply-To'] = params.inReplyTo;
    (mailOptions.headers as Record<string, string>)['References'] = params.references || params.inReplyTo;
  }

  try {
    const info = await transporter.sendMail(mailOptions);

    logger.info('Email sent successfully', {
      messageId,
      from: smtpConfig.email,
      to: params.to,
      subject: params.subject.substring(0, 50),
    });

    return {
      messageId,
      accepted: info.accepted as string[],
    };
  } catch (error: any) {
    logger.error('Failed to send email', {
      from: smtpConfig.email,
      to: params.to,
      error: error.message,
    });
    throw error;
  } finally {
    transporter.close();
  }
}

/**
 * Test SMTP connection to verify credentials.
 * Returns true if connection is successful.
 */
export async function testSmtpConnection(config: SmtpConfig): Promise<boolean> {
  const transporter = createTransporter(config);

  try {
    await transporter.verify();
    logger.info(`SMTP connection verified: ${config.email}`);
    return true;
  } catch (error: any) {
    logger.error(`SMTP connection failed: ${config.email}`, { error: error.message });
    throw new Error(`SMTP connection failed: ${error.message}`);
  } finally {
    transporter.close();
  }
}
