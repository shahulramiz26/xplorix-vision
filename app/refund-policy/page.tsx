'use client'
import LegalLayout from '../components/LegalLayout'

const H2 = ({c}:{c:string}) => <h2 style={{fontSize:18,fontWeight:700,color:'#C2410C',marginBottom:10,marginTop:36,paddingBottom:8,borderBottom:'1px solid rgba(249,115,22,0.15)'}}>{c}</h2>
const P  = ({c}:{c:string}) => <p  style={{fontSize:14,color:'#56606E',lineHeight:1.8,marginBottom:10}}>{c}</p>
const B  = ({c}:{c:string}) => <p  style={{fontSize:14,fontWeight:700,color:'#0B0F17',marginBottom:4,marginTop:14}}>{c}</p>
const Ul = ({items}:{items:string[]}) => <ul style={{paddingLeft:20,marginBottom:10}}>{items.map((t,i)=><li key={i} style={{fontSize:14,color:'#56606E',lineHeight:1.8,marginBottom:3}}>{t}</li>)}</ul>

export default function RefundPolicy() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated="1 June 2026">

      <H2 c="1. Overview"/>
      <P c="At XPLORIX, operated by ANMAK CONSULTANCY SERVICES PRIVATE LIMITED, we are committed to providing a high-quality drilling intelligence platform. This Refund Policy is in accordance with the Consumer Protection Act, 2019 and applicable Indian laws. It outlines the circumstances under which refunds are available and the process to request one."/>

      <H2 c="2. Free Trial"/>
      <P c="XPLORIX offers a 15-day free trial with full access to all platform features. No payment is required during the trial period. We strongly encourage all users to thoroughly evaluate the platform during the trial before subscribing to a paid plan."/>

      <H2 c="3. Subscription Refunds"/>
      <B c="Monthly Plans"/>
      <P c="Monthly subscriptions are non-refundable once the billing period has commenced. You may cancel at any time and your access will continue until the end of the current billing period."/>
      <B c="Half-Yearly Plans"/>
      <P c="If you cancel within the first 7 days of a new half-yearly billing period, you are eligible for a pro-rata refund for the unused complete months. Cancellations after 7 days are non-refundable for that period."/>
      <B c="Annual Plans"/>
      <P c="If you cancel within the first 14 days of a new annual billing period, you are eligible for a pro-rata refund for the unused complete months. Cancellations after 14 days are non-refundable for that annual period."/>

      <H2 c="4. Eligible Refund Circumstances"/>
      <P c="In accordance with the Consumer Protection Act, 2019, we will issue a full refund in the following circumstances:"/>
      <Ul items={[
        'Technical Failure â€” The platform is materially unusable due to a technical issue on our side and we are unable to resolve it within 5 business days',
        'Duplicate Charge â€” You were charged twice for the same subscription period',
        'Billing Error â€” You were charged an incorrect amount due to our error',
        'Unauthorised Charge â€” A charge was made to your account without your authorisation',
        'Service Not as Described â€” The service materially differs from the description provided at the time of purchase',
      ]}/>

      <H2 c="5. Non-Refundable Circumstances"/>
      <P c="Refunds will not be issued in the following situations:"/>
      <Ul items={[
        'Change of mind after the free trial period has ended',
        'Failure to cancel before the next billing cycle renews',
        'Partial use of a subscription period',
        'Dissatisfaction with features that were available for evaluation during the 15-day free trial',
        'Accounts terminated due to violation of our Terms of Service',
        'Downtime caused by circumstances beyond our reasonable control including force majeure events',
      ]}/>

      <H2 c="6. GST and Taxes"/>
      <P c="All refunds, where applicable, will be processed for the amount paid excluding Goods and Services Tax (GST), unless otherwise required by applicable Indian tax laws. GST amounts are non-refundable as they are remitted to the Government of India."/>

      <H2 c="7. How to Request a Refund"/>
      <P c="To request a refund, contact our team within the eligible timeframe through the support section on our website at xplorixtech.com. Please provide the following:"/>
      <Ul items={[
        'Your company name and registered email address',
        'The reason for your refund request',
        'The invoice or transaction reference number',
        'Any supporting evidence for technical failures or billing errors',
      ]}/>
      <P c="We will review your request and respond within 3 business days."/>

      <H2 c="8. Refund Processing"/>
      <P c="Approved refunds will be processed back to the original payment method within 7 to 10 business days. For payments made via UPI, NEFT or IMPS, refunds will be processed within 5 to 7 business days, subject to your bank's processing timelines."/>

      <H2 c="9. Dispute Resolution"/>
      <P c="If you believe a charge is incorrect or have a billing dispute, please contact our support team before initiating a chargeback with your bank. We will work with you in good faith to resolve the issue promptly. Disputes may also be raised with the appropriate Consumer Forum as per the Consumer Protection Act, 2019."/>

      <H2 c="10. Changes to This Policy"/>
      <P c="We may update this Refund Policy at any time. Changes will be posted on our website at xplorixtech.com with the updated effective date. Continued use of the platform after changes constitutes your acceptance of the revised policy."/>

      <H2 c="11. Governing Law"/>
      <P c="This Refund Policy shall be governed by the laws of India including the Consumer Protection Act, 2019 and the Indian Contract Act, 1872. Any disputes shall be subject to the exclusive jurisdiction of the competent courts in India."/>

    </LegalLayout>
  )
}

