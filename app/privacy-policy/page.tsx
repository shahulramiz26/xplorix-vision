'use client'
import LegalLayout from '../components/LegalLayout'

const H2 = ({c}:{c:string}) => <h2 style={{fontSize:18,fontWeight:700,color:'#C2410C',marginBottom:10,marginTop:36,paddingBottom:8,borderBottom:'1px solid rgba(249,115,22,0.15)'}}>{c}</h2>
const P  = ({c}:{c:string}) => <p  style={{fontSize:14,color:'#56606E',lineHeight:1.8,marginBottom:10}}>{c}</p>
const B  = ({c}:{c:string}) => <p  style={{fontSize:14,fontWeight:700,color:'#0B0F17',marginBottom:4,marginTop:14}}>{c}</p>
const Ul = ({items}:{items:string[]}) => <ul style={{paddingLeft:20,marginBottom:10}}>{items.map((t,i)=><li key={i} style={{fontSize:14,color:'#56606E',lineHeight:1.8,marginBottom:3}}>{t}</li>)}</ul>

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="1 June 2026">

      <H2 c="1. Introduction"/>
      <P c="Welcome to XPLORIX. XPLORIX is an AI-powered drilling intelligence platform operated by ANMAK CONSULTANCY SERVICES PRIVATE LIMITED, a company incorporated under the Companies Act, 2013 in India."/>
      <P c="This Privacy Policy is published in accordance with the provisions of the Information Technology Act, 2000 and the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011."/>
      <P c="By using XPLORIX, you consent to the collection and use of your information as described in this policy."/>

      <H2 c="2. Information We Collect"/>
      <B c="Account Information"/>
      <P c="Full name, company name, work email address, phone number, country, industry type and number of rigs."/>
      <B c="Operational Data"/>
      <P c="Drill logs, shift data, rig performance records, consumables data, personnel records and financial data entered into the platform."/>
      <B c="Usage Data"/>
      <P c="Pages visited, features used, login times, device type, browser type and IP address."/>
      <B c="Sensitive Personal Data or Information (SPDI)"/>
      <P c="As defined under the IT Rules 2011, we may collect passwords and financial information. This data is collected only with your explicit consent and used solely for providing our services."/>

      <H2 c="3. Purpose of Collection"/>
      <P c="We collect and process your information for the following purposes:"/>
      <Ul items={['To provide, operate and maintain the XPLORIX platform','To process your registration and manage your account','To generate AI-powered insights and analytics from your operational data','To send service notifications, updates and support communications','To improve platform features and user experience','To comply with applicable Indian laws and regulations','To detect and prevent fraud or security incidents']}/>
      <P c="We will not use your information for any purpose other than those stated above without your prior consent."/>

      <H2 c="4. Data Storage and Security"/>
      <P c="Your data is stored on secure cloud servers. We implement reasonable security practices and procedures as mandated under the IT (SPDI) Rules, 2011, including:"/>
      <Ul items={['Encryption of data in transit (TLS/SSL) and at rest (AES-256)','Role-based access controls â€” Admin, Supervisor, and Driller roles','Complete data isolation â€” no other company can access your data','Regular security monitoring and audits','Secure authentication with password hashing']}/>

      <H2 c="5. Disclosure of Information"/>
      <P c="We do not sell, trade or rent your personal information to third parties. We may share your information only in the following circumstances:"/>
      <B c="Service Providers"/><P c="Trusted third-party vendors who assist in operating our platform, under strict confidentiality obligations."/>
      <B c="Legal Compliance"/><P c="When required by any court of competent jurisdiction, law enforcement authority or government body under applicable Indian law."/>
      <B c="Business Transfers"/><P c="In the event of a merger, amalgamation or acquisition, with appropriate notice to you."/>

      <H2 c="6. Data Retention"/>
      <P c="We retain your account and operational data for as long as your account remains active. Upon account closure, data is retained for 90 days before permanent deletion, unless retention is required under applicable Indian law."/>

      <H2 c="7. Your Rights"/>
      <Ul items={['Access â€” Request a copy of personal data we hold about you','Correction â€” Request correction of inaccurate or incomplete data','Withdrawal of Consent â€” Withdraw consent for processing at any time, subject to legal obligations','Grievance Redressal â€” Raise a grievance with our designated Grievance Officer']}/>
      <P c="In accordance with the Information Technology Act, 2000 and IT Rules, 2011, the name and contact details of the Grievance Officer shall be published on our website. All grievances will be addressed within 30 days of receipt."/>

      <H2 c="8. Cookies"/>
      <P c="We use essential cookies solely to maintain your login session. We do not use advertising or third-party tracking cookies. Please refer to our Cookie Policy for full details."/>

      <H2 c="9. Children's Privacy"/>
      <P c="XPLORIX is a professional B2B platform intended solely for business use. We do not knowingly collect personal data from individuals under 18 years of age."/>

      <H2 c="10. Changes to This Policy"/>
      <P c="We reserve the right to update this Privacy Policy at any time. Material changes will be communicated via in-platform notification or registered email. Continued use of the platform following notification constitutes your acceptance of the revised policy."/>

      <H2 c="11. Governing Law and Jurisdiction"/>
      <P c="This Privacy Policy shall be governed by and construed in accordance with the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the competent courts in India."/>

    </LegalLayout>
  )
}

