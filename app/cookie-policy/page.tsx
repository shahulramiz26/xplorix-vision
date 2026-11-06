'use client'
import LegalLayout from '../components/LegalLayout'

const H2 = ({c}:{c:string}) => (
  <h2 style={{fontSize:18,fontWeight:700,color:'#C2410C',marginBottom:10,marginTop:36,paddingBottom:8,borderBottom:'1px solid rgba(249,115,22,0.15)'}}>{c}</h2>
)
const P = ({c}:{c:string}) => (
  <p style={{fontSize:14,color:'#56606E',lineHeight:1.8,marginBottom:10}}>{c}</p>
)
const B = ({c}:{c:string}) => (
  <p style={{fontSize:14,fontWeight:700,color:'#0B0F17',marginBottom:4,marginTop:14}}>{c}</p>
)
const Ul = ({items}:{items:string[]}) => (
  <ul style={{paddingLeft:20,marginBottom:10}}>
    {items.map((t,i)=>(
      <li key={i} style={{fontSize:14,color:'#56606E',lineHeight:1.8,marginBottom:3}}>{t}</li>
    ))}
  </ul>
)
const Table = ({rows}:{rows:[string,string,string][]}) => (
  <div style={{overflowX:'auto',marginBottom:16}}>
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
      <thead>
        <tr>
          {['Cookie Name','Purpose','Duration'].map(h=>(
            <th key={h} style={{padding:'10px 14px',background:'rgba(249,115,22,0.08)',border:'1px solid rgba(11,15,23,0.06)',color:'#C2410C',fontWeight:700,textAlign:'left'}}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row,i)=>(
          <tr key={i}>
            {row.map((cell,j)=>(
              <td key={j} style={{padding:'9px 14px',border:'1px solid rgba(11,15,23,0.06)',color:'#56606E',background:i%2===0?'rgba(11,15,23,0.02)':'transparent'}}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

export default function CookiePolicy() {
  return (
    <LegalLayout title="Cookie Policy" lastUpdated="1 June 2026">

      <H2 c="1. Introduction"/>
      <P c="This Cookie Policy explains how XPLORIX, operated by ANMAK CONSULTANCY SERVICES PRIVATE LIMITED, uses cookies and similar tracking technologies when you use our platform at xplorixtech.com."/>
      <P c="This policy should be read in conjunction with our Privacy Policy and Terms of Service."/>

      <H2 c="2. What Are Cookies?"/>
      <P c="Cookies are small text files that are placed on your device when you visit a website or use a web application. They are widely used to make websites and applications work efficiently."/>
      <P c="Cookies can be session cookies (deleted when you close your browser) or persistent cookies (remain on your device for a set period or until you delete them)."/>

      <H2 c="3. How We Use Cookies"/>
      <P c="XPLORIX uses cookies strictly for essential operational purposes. We do not use advertising cookies, tracking cookies or any third-party marketing cookies. Our use of cookies is limited to what is necessary to provide you with a functional and secure platform."/>

      <H2 c="4. Types of Cookies We Use"/>
      <B c="Essential Cookies"/>
      <P c="These cookies are strictly necessary for the platform to function. Without these cookies, the services you have asked for cannot be provided."/>
      <Table rows={[
        ['session_token',   'Maintains your login session while you use the platform',    'Session (deleted on logout)'],
        ['csrf_token',      'Protects against cross-site request forgery attacks',         'Session'],
        ['company_id',      'Identifies your company account for data isolation',          'Session'],
        ['user_role',       'Stores your role (Admin/Supervisor/Driller) for permissions', 'Session'],
        ['auth_preference', 'Remembers your login preference if Remember me is checked',   '30 days'],
      ]}/>

      <B c="Functional Cookies"/>
      <P c="These cookies allow the platform to remember choices you make and provide enhanced features."/>
      <Table rows={[
        ['currency_pref',    'Remembers your preferred currency selection',  '90 days'],
        ['dashboard_layout', 'Saves your preferred dashboard configuration', '90 days'],
        ['theme_pref',       'Stores display preferences',                   '90 days'],
      ]}/>

      <H2 c="5. Cookies We Do NOT Use"/>
      <P c="We do not use the following types of cookies:"/>
      <Ul items={[
        'Advertising or targeting cookies',
        'Third-party social media tracking cookies',
        'Analytics cookies that track your behaviour across other websites',
        'Profiling or personalisation cookies for marketing purposes',
        'Any cookies that share your data with third-party advertisers',
      ]}/>

      <H2 c="6. Third-Party Cookies"/>
      <P c="XPLORIX does not allow any third-party cookies to be placed on your device through our platform. All cookies used are set directly by XPLORIX (first-party cookies) for the purposes described above."/>

      <H2 c="7. Managing and Disabling Cookies"/>
      <P c="You have the right to decide whether to accept or reject cookies through your browser settings:"/>
      <B c="Google Chrome"/>
      <P c="Settings → Privacy and security → Cookies and other site data"/>
      <B c="Mozilla Firefox"/>
      <P c="Options → Privacy and Security → Cookies and Site Data"/>
      <B c="Safari"/>
      <P c="Preferences → Privacy → Manage Website Data"/>
      <B c="Microsoft Edge"/>
      <P c="Settings → Cookies and site permissions"/>
      <P c="Please note that if you disable or delete essential cookies, you will not be able to log into the XPLORIX platform and some features may not function correctly."/>

      <H2 c="8. Cookie Duration"/>
      <P c="Session cookies are automatically deleted when you close your browser or log out. Persistent cookies remain on your device for the duration specified above, or until you manually delete them."/>

      <H2 c="9. Legal Basis"/>
      <P c="Our use of essential cookies is based on our legitimate interest in providing a functioning and secure platform. Our use of functional cookies is based on your consent by continuing to use the platform."/>
      <P c="This Cookie Policy is governed by the Information Technology Act, 2000 and the Information Technology (Amendment) Act, 2008 of India."/>

      <H2 c="10. Changes to This Policy"/>
      <P c="We may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated effective date. Continued use of our platform after changes constitutes your acceptance."/>

      <H2 c="11. Governing Law"/>
      <P c="This Cookie Policy shall be governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the competent courts in India."/>

    </LegalLayout>
  )
}
