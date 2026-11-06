'use client'
import LegalLayout from '../components/LegalLayout'

const H2 = ({c}:{c:string}) => <h2 style={{fontSize:18,fontWeight:700,color:'#C2410C',marginBottom:10,marginTop:36,paddingBottom:8,borderBottom:'1px solid rgba(249,115,22,0.15)'}}>{c}</h2>
const P  = ({c}:{c:string}) => <p  style={{fontSize:14,color:'#56606E',lineHeight:1.8,marginBottom:10}}>{c}</p>
const B  = ({c}:{c:string}) => <p  style={{fontSize:14,fontWeight:700,color:'#0B0F17',marginBottom:4,marginTop:14}}>{c}</p>
const Ul = ({items}:{items:string[]}) => <ul style={{paddingLeft:20,marginBottom:10}}>{items.map((t,i)=><li key={i} style={{fontSize:14,color:'#56606E',lineHeight:1.8,marginBottom:3}}>{t}</li>)}</ul>

export default function TermsOfService() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="1 June 2026">

      <H2 c="1. Acceptance of Terms"/>
      <P c="These Terms of Service constitute a legally binding agreement between you ('User') and ANMAK CONSULTANCY SERVICES PRIVATE LIMITED ('XPLORIX', 'we', 'us', 'our') governed by the Indian Contract Act, 1872. By accessing or using the XPLORIX platform, you confirm that you have read, understood and agree to be bound by these Terms."/>
      <P c="If you are accessing the platform on behalf of a company, you represent that you have the legal authority to bind that entity to these Terms."/>

      <H2 c="2. Description of Service"/>
      <P c="XPLORIX is a cloud-based SaaS platform providing:"/>
      <Ul items={['Digital drill logging and shift management','Real-time operations analytics and dashboards','AI-powered insights and predictive maintenance alerts','Driller performance tracking and reporting','Inventory, consumables and cost management','Performance certificates and reporting tools']}/>

      <H2 c="3. Account Registration"/>
      <P c="To use XPLORIX, you must:"/>
      <Ul items={['Provide accurate and complete registration information','Keep your login credentials secure and confidential','Notify us immediately of any unauthorised access to your account','Be at least 18 years of age or the age of majority in your jurisdiction']}/>
      <P c="You are responsible for all activity that occurs under your account. Each company account is completely isolated â€” your data is never accessible to other companies on the platform."/>

      <H2 c="4. Free Trial"/>
      <P c="XPLORIX offers a 15-day free trial with full access to all platform features. No credit card is required to start your trial. At the end of the trial period, you may choose to subscribe to a paid plan. If you do not subscribe, your account will be suspended and data retained for 30 days before deletion."/>

      <H2 c="5. Subscription and Payment"/>
      <B c="Plans"/><P c="XPLORIX offers Standard, Growth and Enterprise subscription plans. Pricing is customised based on your fleet size and requirements."/>
      <B c="Billing"/><P c="Subscriptions are billed in advance on a monthly, half-yearly or annual basis. All payments are subject to applicable Goods and Services Tax (GST) as per Indian tax laws."/>
      <B c="Cancellation"/><P c="You may cancel your subscription at any time. Cancellation takes effect at the end of your current billing period. Refunds are governed by our Refund Policy."/>
      <B c="Price Changes"/><P c="We reserve the right to modify pricing with 30 days advance written notice."/>

      <H2 c="6. Acceptable Use"/>
      <P c="You agree not to:"/>
      <Ul items={['Use XPLORIX for any unlawful purpose or in violation of any Indian laws or regulations','Upload false, misleading or fraudulent operational data','Attempt to gain unauthorised access to any part of the platform or other users\' accounts','Reverse engineer, decompile or attempt to extract the source code of the platform','Resell, sublicense or commercially exploit any part of the platform without written consent','Transmit viruses, malware or any harmful code','Use the platform to store or transmit content that is defamatory, offensive or illegal under Indian law']}/>

      <H2 c="7. Intellectual Property"/>
      <P c="All content, features, functionality, software, code, designs, logos and trademarks of XPLORIX are owned by ANMAK CONSULTANCY SERVICES PRIVATE LIMITED and are protected under the Copyright Act, 1957 and Trade Marks Act, 1999 of India."/>
      <P c="You are granted a limited, non-exclusive, non-transferable licence to use the platform for your internal business purposes only. Your operational data remains your property."/>

      <H2 c="8. Consumer Protection"/>
      <P c="As a B2B platform, XPLORIX services are provided to business entities. However, where applicable, we comply with the Consumer Protection Act, 2019 of India. Users who are individual consumers may contact our Grievance Officer for any disputes or complaints."/>

      <H2 c="9. Availability and Uptime"/>
      <P c="We aim to maintain high platform availability. We may perform scheduled maintenance with advance notice. We are not liable for losses arising from temporary unavailability due to circumstances beyond our reasonable control including acts of God, government actions, internet disruptions or force majeure events."/>

      <H2 c="10. Limitation of Liability"/>
      <Ul items={['XPLORIX is provided on an \'as is\' basis without warranties of any kind','We are not liable for any indirect, incidental, consequential or punitive damages','Our total liability for any claim shall not exceed the amount paid by you in the 3 months preceding the claim']}/>

      <H2 c="11. Dispute Resolution and Arbitration"/>
      <P c="Any dispute arising out of or relating to these Terms shall first be attempted to be resolved through good faith negotiation. If unresolved within 30 days, disputes shall be referred to arbitration under the Arbitration and Conciliation Act, 1996 of India. The seat of arbitration shall be in India and proceedings shall be conducted in English."/>

      <H2 c="12. Termination"/>
      <P c="We reserve the right to suspend or terminate your account if you violate these Terms, fail to pay your subscription, or engage in activity that harms the platform or other users."/>

      <H2 c="13. Governing Law and Jurisdiction"/>
      <P c="These Terms are governed by the laws of India including the Indian Contract Act, 1872, the Information Technology Act, 2000 and the Consumer Protection Act, 2019. Any disputes shall be subject to the exclusive jurisdiction of the competent courts in India."/>

      <H2 c="14. Changes to Terms"/>
      <P c="We may update these Terms from time to time. We will notify you of material changes at least 15 days prior to the changes taking effect. Continued use of XPLORIX after changes constitutes acceptance."/>

    </LegalLayout>
  )
}

