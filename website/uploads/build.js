const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'site');
const DOMAIN = 'https://www.hansinfomatic.com';

// ─── Page Mappings ───────────────────────────────────────────────
// { src: source folder, out: output path, title, desc, keywords }
const pages = [
  // ── Core Pages ──
  { src: 'hans_infomatic_homepage_redesign', out: 'index.html',
    title: 'Hans Infomatic — Digital Intelligence for Global Cargo & Logistics',
    desc: 'Hans Infomatic delivers intelligent automation for cargo, freight forwarding, customs compliance, warehouse management, and logistics operations across 50+ countries.',
    keywords: 'cargo technology, logistics software, freight automation, customs compliance, digital logistics, Hans Infomatic' },
  { src: 'hans_infomatic_products', out: 'products/index.html',
    title: 'Products — Intelligent Logistics Software Suite | Hans Infomatic',
    desc: 'Explore Hans Infomatic\'s complete product suite: iCAFFE, BagTrack, WiseCargo, WiseDOX, WiseFleet, WiseGSA, WiseHRMS, VMS, CRMExpert, and more.',
    keywords: 'logistics products, cargo software, freight management system, warehouse management' },
  { src: 'hans_infomatic_industries', out: 'industries/index.html',
    title: 'Industries We Serve — Airlines, Freight, Customs & More | Hans Infomatic',
    desc: 'Hans Infomatic serves airlines, freight forwarders, customs brokers, terminal operators, and carriers with tailored logistics technology solutions.',
    keywords: 'airline cargo, freight forwarder software, customs broker technology, terminal operations' },
  { src: 'about_us_events_pricing_awards_hub', out: 'company/about.html',
    title: 'About Us — Our Story, Mission & Awards | Hans Infomatic',
    desc: 'Learn about Hans Infomatic\'s mission to transform global logistics through digital intelligence. Discover our awards, milestones, and global presence.',
    keywords: 'about Hans Infomatic, logistics company, cargo technology provider, awards' },
  { src: 'contact_us_global_policy_hub', out: 'contact.html',
    title: 'Contact Us — Global Offices & Support | Hans Infomatic',
    desc: 'Get in touch with Hans Infomatic. Reach our global offices, request support, or schedule a consultation for your logistics technology needs.',
    keywords: 'contact Hans Infomatic, logistics support, cargo technology contact' },
  { src: 'blog', out: 'company/blog.html',
    title: 'Blog — Logistics Insights & Industry Trends | Hans Infomatic',
    desc: 'Stay updated with the latest trends in cargo logistics, freight technology, customs compliance, and digital transformation from Hans Infomatic experts.',
    keywords: 'logistics blog, cargo industry news, freight technology trends' },
  { src: 'case_studies', out: 'company/case-studies.html',
    title: 'Case Studies — Client Success Stories | Hans Infomatic',
    desc: 'Discover how airlines, freight forwarders, and logistics companies transformed their operations with Hans Infomatic solutions.',
    keywords: 'logistics case studies, cargo technology success stories, freight management ROI' },
  { src: 'hans_infomatic_book_a_demo', out: 'book-demo.html',
    title: 'Book a Demo — See Our Solutions in Action | Hans Infomatic',
    desc: 'Schedule a personalized demo of Hans Infomatic\'s logistics solutions. See how our AI-powered platform can transform your cargo operations.',
    keywords: 'book demo, logistics software demo, cargo technology trial' },
  { src: 'be_a_partner', out: 'partner.html',
    title: 'Become a Partner — Join Our Global Network | Hans Infomatic',
    desc: 'Partner with Hans Infomatic to deliver cutting-edge logistics technology to your clients. Explore our partner programs and benefits.',
    keywords: 'logistics partner program, technology partnership, cargo software reseller' },

  // ── Product: iCAFFE ──
  { src: 'icaffe_flagship_ai_powered_freight_management_hub', out: 'products/icaffe/index.html',
    title: 'iCAFFE — AI-Powered Freight Management System | Hans Infomatic',
    desc: 'iCAFFE is an AI-powered cargo and freight forwarding execution platform that automates shipment management, documentation, and real-time tracking.',
    keywords: 'iCAFFE, freight management system, cargo automation, AI freight, shipment tracking' },
  { src: 'icaffe_solution_platform_deep_dive', out: 'products/icaffe/detail.html',
    title: 'iCAFFE Platform Deep Dive — Features & Capabilities | Hans Infomatic',
    desc: 'Explore iCAFFE\'s complete feature set: automated booking, rate management, shipment tracking, document generation, and AI-driven freight optimization.',
    keywords: 'iCAFFE features, freight software capabilities, cargo platform details' },
  { src: 'icaffe_faq_operational_intelligence_refined', out: 'products/icaffe/faq.html',
    title: 'iCAFFE FAQ — Frequently Asked Questions | Hans Infomatic',
    desc: 'Get answers to common questions about iCAFFE freight management system — implementation, integrations, pricing, and operational intelligence.',
    keywords: 'iCAFFE FAQ, freight management questions, cargo software help' },

  // ── Product: BagTrack ──
  { src: 'bagtrack_flagship_floating_form_landing_page', out: 'products/bagtrack/index.html',
    title: 'BagTrack — Intelligent Baggage Reconciliation System | Hans Infomatic',
    desc: 'BagTrack provides real-time baggage tracking, automated reconciliation, and RFID-enabled management for airlines and ground handlers.',
    keywords: 'BagTrack, baggage tracking, baggage reconciliation, airline baggage, RFID tracking' },
  { src: 'bagtrack_product_detail', out: 'products/bagtrack/detail.html',
    title: 'BagTrack Features — Complete Baggage Management | Hans Infomatic',
    desc: 'Discover BagTrack\'s full feature set: RFID scanning, real-time tracking dashboards, mishandled baggage alerts, and compliance reporting.',
    keywords: 'BagTrack features, baggage management system, airline baggage technology' },
  { src: 'bagtrack_faq_final', out: 'products/bagtrack/faq.html',
    title: 'BagTrack FAQ — Frequently Asked Questions | Hans Infomatic',
    desc: 'Get answers to common questions about BagTrack baggage reconciliation system — setup, integrations, RFID compatibility, and more.',
    keywords: 'BagTrack FAQ, baggage system questions, airline technology help' },

  // ── Product: WiseCargo ──
  { src: 'wisecargo_hub_with_floating_form', out: 'products/wisecargo/index.html',
    title: 'WiseCargo — Terminal & Cargo Operations Platform | Hans Infomatic',
    desc: 'WiseCargo streamlines terminal cargo operations with real-time inventory management, automated workflows, and intelligent capacity planning.',
    keywords: 'WiseCargo, terminal operations, cargo management, warehouse operations, capacity planning' },
  { src: 'wisecargo_product_detail', out: 'products/wisecargo/detail.html',
    title: 'WiseCargo Features — Terminal Operations Management | Hans Infomatic',
    desc: 'Explore WiseCargo\'s capabilities: cargo acceptance, storage management, build-up/breakdown, delivery processing, and real-time dashboards.',
    keywords: 'WiseCargo features, terminal cargo system, cargo operations platform' },
  { src: 'wisecargo_the_flagship_faq_hub', out: 'products/wisecargo/faq.html',
    title: 'WiseCargo FAQ — Frequently Asked Questions | Hans Infomatic',
    desc: 'Answers to common questions about WiseCargo terminal operations platform — implementation, integrations, and operational benefits.',
    keywords: 'WiseCargo FAQ, terminal operations questions, cargo system help' },

  // ── Product: WiseCCS ──
  { src: 'ccs_the_flagship_intelligence_hub_flagship_edition', out: 'products/wiseccs/index.html',
    title: 'WiseCCS — Cargo Community System | Hans Infomatic',
    desc: 'WiseCCS is a comprehensive cargo community system connecting airlines, handlers, forwarders, and customs through a unified digital platform.',
    keywords: 'WiseCCS, cargo community system, logistics connectivity, digital cargo hub' },
  { src: 'wiseccs_product_detail_updated', out: 'products/wiseccs/detail.html',
    title: 'WiseCCS Features — Cargo Community Platform | Hans Infomatic',
    desc: 'Discover WiseCCS capabilities: stakeholder connectivity, real-time data sharing, customs integration, and community-wide analytics.',
    keywords: 'WiseCCS features, cargo community platform, logistics connectivity system' },

  // ── Product: WiseDOX ──
  { src: 'wisedox_ai_document_management_with_floating_form', out: 'products/wisedox/index.html',
    title: 'WiseDOX — AI Document Management for Logistics | Hans Infomatic',
    desc: 'WiseDOX automates document processing, OCR extraction, and compliance verification for freight and customs documentation.',
    keywords: 'WiseDOX, document management, OCR logistics, AI document processing, customs documents' },
  { src: 'wisedox_product_detail', out: 'products/wisedox/detail.html',
    title: 'WiseDOX Features — Intelligent Document Platform | Hans Infomatic',
    desc: 'Explore WiseDOX features: AI-powered OCR, automated classification, compliance checks, digital archival, and seamless integrations.',
    keywords: 'WiseDOX features, document automation, logistics OCR, compliance verification' },
  { src: 'wisedox_faq_final', out: 'products/wisedox/faq.html',
    title: 'WiseDOX FAQ — Frequently Asked Questions | Hans Infomatic',
    desc: 'Answers to common questions about WiseDOX document management system — setup, AI capabilities, supported formats, and more.',
    keywords: 'WiseDOX FAQ, document management questions, logistics OCR help' },

  // ── Product: WiseFleet ──
  { src: 'wisefleet_fleet_management_with_floating_form', out: 'products/wisefleet/index.html',
    title: 'WiseFleet — Fleet & Transport Management System | Hans Infomatic',
    desc: 'WiseFleet provides intelligent fleet management, route optimization, driver tracking, and transport logistics automation.',
    keywords: 'WiseFleet, fleet management, TMS, transport management, route optimization, driver tracking' },
  { src: 'hans_infomatic_wisefleet_product_detail', out: 'products/wisefleet/detail.html',
    title: 'WiseFleet Features — Fleet Management Platform | Hans Infomatic',
    desc: 'Discover WiseFleet capabilities: GPS tracking, route planning, fuel management, driver performance analytics, and maintenance scheduling.',
    keywords: 'WiseFleet features, fleet tracking, transport management capabilities' },

  // ── Product: WiseGSA ──
  { src: 'wisegsa_sales_ops_hub', out: 'products/wisegsa/index.html',
    title: 'WiseGSA — Airline Sales & Operations Platform | Hans Infomatic',
    desc: 'WiseGSA empowers General Sales Agents with automated sales tracking, revenue management, and airline representation tools.',
    keywords: 'WiseGSA, airline GSA, sales operations, revenue management, airline representation' },
  { src: 'wisegsa_product_detail_ai_fixed', out: 'products/wisegsa/detail.html',
    title: 'WiseGSA Features — GSA Management Platform | Hans Infomatic',
    desc: 'Explore WiseGSA features: sales pipeline tracking, airline revenue analytics, commission management, and performance dashboards.',
    keywords: 'WiseGSA features, GSA platform, airline sales management capabilities' },
  { src: 'wisegsa_faq_final', out: 'products/wisegsa/faq.html',
    title: 'WiseGSA FAQ — Frequently Asked Questions | Hans Infomatic',
    desc: 'Answers to common questions about WiseGSA GSA management platform — features, pricing, integrations, and airline partnerships.',
    keywords: 'WiseGSA FAQ, GSA software questions, airline sales help' },

  // ── Product: WiseHandling ──
  { src: 'wisehandling_the_flagship_intelligence_hub', out: 'products/wisehandling/index.html',
    title: 'WiseHandling — Ground Handling Operations System | Hans Infomatic',
    desc: 'WiseHandling digitizes ground handling operations with real-time resource allocation, SLA monitoring, and operational intelligence.',
    keywords: 'WiseHandling, ground handling, airport operations, resource management, SLA monitoring' },
  { src: 'wisehandling_product_detail', out: 'products/wisehandling/detail.html',
    title: 'WiseHandling Features — Ground Handling Platform | Hans Infomatic',
    desc: 'Discover WiseHandling capabilities: resource scheduling, turnaround management, compliance tracking, and real-time operations dashboards.',
    keywords: 'WiseHandling features, ground handling system, airport operations platform' },

  // ── Product: WiseHRMS ──
  { src: 'wisehrms_hr_intelligence_with_floating_form', out: 'products/wisehrms/index.html',
    title: 'WiseHRMS — HR Intelligence & Workforce Management | Hans Infomatic',
    desc: 'WiseHRMS provides comprehensive human resource management with payroll, attendance, recruitment, and workforce analytics for logistics companies.',
    keywords: 'WiseHRMS, HR management, workforce management, payroll system, logistics HR' },
  { src: 'wisehrms_product_detail_updated', out: 'products/wisehrms/detail.html',
    title: 'WiseHRMS Features — HR Management Platform | Hans Infomatic',
    desc: 'Explore WiseHRMS features: employee lifecycle management, payroll processing, leave management, performance reviews, and HR analytics.',
    keywords: 'WiseHRMS features, HR software capabilities, workforce management system' },
  { src: 'wisehrms_faq_final', out: 'products/wisehrms/faq.html',
    title: 'WiseHRMS FAQ — Frequently Asked Questions | Hans Infomatic',
    desc: 'Answers to common questions about WiseHRMS — setup, payroll integrations, compliance, and employee management features.',
    keywords: 'WiseHRMS FAQ, HR management questions, workforce system help' },

  // ── Product: WiseSTOX ──
  { src: 'wisestox_wms_with_floating_form', out: 'products/wisestox/index.html',
    title: 'WiseSTOX — Warehouse Management System | Hans Infomatic',
    desc: 'WiseSTOX delivers intelligent warehouse management with real-time inventory tracking, automated picking, and storage optimization.',
    keywords: 'WiseSTOX, warehouse management, WMS, inventory tracking, storage optimization' },
  { src: 'hans_infomatic_wisestox_wms_detail_updated', out: 'products/wisestox/detail.html',
    title: 'WiseSTOX Features — Warehouse Management Platform | Hans Infomatic',
    desc: 'Discover WiseSTOX capabilities: inventory management, zone mapping, automated picking routes, receiving/dispatch, and analytics dashboards.',
    keywords: 'WiseSTOX features, WMS capabilities, warehouse technology platform' },
  { src: 'wisestox_wms_faq_final', out: 'products/wisestox/faq.html',
    title: 'WiseSTOX FAQ — Frequently Asked Questions | Hans Infomatic',
    desc: 'Answers to common questions about WiseSTOX warehouse management system — implementation, barcode support, integrations, and ROI.',
    keywords: 'WiseSTOX FAQ, WMS questions, warehouse management help' },

  // ── Product: WiseDO ──
  { src: 'wisedo_e_delivery_order_with_floating_form', out: 'products/wisedo/index.html',
    title: 'WiseDO — Electronic Delivery Order System | Hans Infomatic',
    desc: 'WiseDO digitizes the delivery order process with automated generation, real-time tracking, and paperless customs clearance workflows.',
    keywords: 'WiseDO, electronic delivery order, e-DO, customs clearance, paperless logistics' },

  // ── Product: VMS ──
  { src: 'vms_gate_security_with_floating_form', out: 'products/vms/index.html',
    title: 'VMS — Vehicle & Gate Security Management | Hans Infomatic',
    desc: 'VMS provides AI-powered vehicle management, gate security automation, ANPR recognition, and access control for logistics facilities.',
    keywords: 'VMS, vehicle management, gate security, ANPR, access control, facility security' },
  { src: 'vms_product_detail_complete', out: 'products/vms/detail.html',
    title: 'VMS Features — Vehicle & Gate Security Platform | Hans Infomatic',
    desc: 'Explore VMS capabilities: ANPR camera integration, automated gate control, vehicle tracking, security alerts, and compliance reporting.',
    keywords: 'VMS features, gate security system, vehicle management platform, ANPR technology' },

  // ── Product: CRMExpert ──
  { src: 'crmexpert_sales_crm_with_floating_form', out: 'products/crmexpert/index.html',
    title: 'CRMExpert — Sales CRM for Logistics | Hans Infomatic',
    desc: 'CRMExpert is a purpose-built CRM for logistics companies with pipeline management, customer analytics, and automated sales workflows.',
    keywords: 'CRMExpert, logistics CRM, sales management, customer relationship, pipeline management' },
  { src: 'crmexpert_product_detail_updated', out: 'products/crmexpert/detail.html',
    title: 'CRMExpert Features — Logistics CRM Platform | Hans Infomatic',
    desc: 'Discover CRMExpert capabilities: lead management, sales pipeline, customer analytics, automated follow-ups, and revenue forecasting.',
    keywords: 'CRMExpert features, logistics CRM capabilities, sales management platform' },

  // ── Product: E-Annex Ultra ──
  { src: 'e_annex_ultra_customs_hub_with_floating_form', out: 'products/e-annex-ultra/index.html',
    title: 'E-Annex Ultra — Customs Compliance & Filing System | Hans Infomatic',
    desc: 'E-Annex Ultra automates customs declarations, compliance checks, and regulatory filing with real-time integration to customs authorities.',
    keywords: 'E-Annex Ultra, customs compliance, customs filing, regulatory automation, trade compliance' },
  { src: 'e_annex_ultra_faq_final', out: 'products/e-annex-ultra/faq.html',
    title: 'E-Annex Ultra FAQ — Frequently Asked Questions | Hans Infomatic',
    desc: 'Answers to common questions about E-Annex Ultra customs compliance system — supported regulations, filing formats, and integration options.',
    keywords: 'E-Annex Ultra FAQ, customs compliance questions, regulatory filing help' },

  // ── Product: AMS ──
  { src: 'ams_manifest_system_with_registration_form', out: 'products/ams/index.html',
    title: 'AMS — Airline Manifest & Messaging System | Hans Infomatic',
    desc: 'AMS provides automated airline manifest generation, Cargo-IMP/XML messaging, and real-time status updates for airline cargo operations.',
    keywords: 'AMS, airline manifest, cargo messaging, Cargo-IMP, airline cargo, IATA messaging' },
  { src: 'hans_infomatic_ams_product_detail_updated', out: 'products/ams/detail.html',
    title: 'AMS Features — Manifest & Messaging Platform | Hans Infomatic',
    desc: 'Explore AMS capabilities: FFM/FWB/FHL message generation, manifest automation, flight planning integration, and compliance reporting.',
    keywords: 'AMS features, airline manifest system, cargo messaging platform' },

  // ── Product: SmATGate ──
  { src: 'smatgate_faq_final', out: 'products/smatgate/faq.html',
    title: 'SmATGate FAQ — Frequently Asked Questions | Hans Infomatic',
    desc: 'Answers to common questions about SmATGate smart gate automation system — features, implementation, and integration capabilities.',
    keywords: 'SmATGate FAQ, smart gate questions, automated gate system help' },

  // ── Product: WiseTrax ──
  { src: 'wisetrax_faq', out: 'products/wisetrax/faq.html',
    title: 'WiseTrax FAQ — Frequently Asked Questions | Hans Infomatic',
    desc: 'Answers to common questions about WiseTrax shipment tracking system — real-time tracking, notifications, and integration options.',
    keywords: 'WiseTrax FAQ, shipment tracking questions, cargo tracking help' },

  // ── Industry Pages ──
  { src: 'airlines_gsas_industry_page_2', out: 'industries/airlines-gsas.html',
    title: 'Airlines & GSAs — Cargo Technology Solutions | Hans Infomatic',
    desc: 'Discover how Hans Infomatic empowers airlines and General Sales Agents with digital cargo management, revenue optimization, and operational efficiency.',
    keywords: 'airline cargo technology, GSA software, airline operations, cargo revenue management' },
  { src: 'freight_forwarders_industry_page_2', out: 'industries/freight-forwarders.html',
    title: 'Freight Forwarders — Digital Forwarding Solutions | Hans Infomatic',
    desc: 'Transform your freight forwarding operations with Hans Infomatic\'s AI-powered shipment management, documentation, and customs compliance tools.',
    keywords: 'freight forwarder software, digital forwarding, shipment management, logistics technology' },
  { src: 'customs_brokers_industry_page', out: 'industries/customs-brokers.html',
    title: 'Customs Brokers — Compliance & Filing Solutions | Hans Infomatic',
    desc: 'Streamline customs brokerage with automated filing, compliance verification, and regulatory integration from Hans Infomatic.',
    keywords: 'customs broker software, customs compliance, regulatory filing, trade compliance' },
  { src: 'terminal_operators_industry_page', out: 'industries/terminal-operators.html',
    title: 'Terminal Operators — Cargo Terminal Management | Hans Infomatic',
    desc: 'Optimize terminal operations with Hans Infomatic\'s integrated cargo handling, capacity planning, and real-time operations management.',
    keywords: 'terminal operations software, cargo terminal management, airport cargo, handling technology' },
  { src: 'carrier_solutions', out: 'industries/carriers.html',
    title: 'Carrier Solutions — Logistics Technology for Carriers | Hans Infomatic',
    desc: 'Hans Infomatic provides carriers with fleet management, route optimization, document automation, and real-time shipment visibility.',
    keywords: 'carrier logistics, fleet management, transport technology, shipment visibility' },

  // ── Services ──
  { src: '24_7_technical_help_desk_global_support_hub', out: 'services/help-desk.html',
    title: '24/7 Technical Support — Global Help Desk | Hans Infomatic',
    desc: 'Access round-the-clock technical support from Hans Infomatic\'s global help desk. Get expert assistance for all our logistics solutions.',
    keywords: '24/7 support, technical help desk, logistics support, cargo software help' },
  { src: 'executive_consultation_strategic_logistics_advisory', out: 'services/executive-consultation.html',
    title: 'Executive Consultation — Strategic Logistics Advisory | Hans Infomatic',
    desc: 'Leverage Hans Infomatic\'s executive consultation services for strategic logistics transformation, digital roadmaps, and operational optimization.',
    keywords: 'logistics consultation, strategic advisory, digital transformation, logistics optimization' },
  { src: 'ai_intelligence_fixed', out: 'services/ai-intelligence.html',
    title: 'AI Intelligence — Smart Logistics Analytics | Hans Infomatic',
    desc: 'Harness the power of AI for predictive analytics, demand forecasting, anomaly detection, and intelligent decision-making in logistics.',
    keywords: 'AI logistics, predictive analytics, demand forecasting, intelligent automation' },
  { src: 'security_architecture_fortified_data_infrastructure', out: 'services/security.html',
    title: 'Security Architecture — Enterprise Data Protection | Hans Infomatic',
    desc: 'Hans Infomatic\'s security architecture ensures enterprise-grade data protection, SOC 2 compliance, encryption, and secure infrastructure.',
    keywords: 'data security, enterprise security, SOC 2, encryption, logistics data protection' },

  // ── Events & Media ──
  { src: 'industry_events_global_logistics_aviation_hub', out: 'company/events.html',
    title: 'Industry Events — Logistics & Aviation Conferences | Hans Infomatic',
    desc: 'Meet Hans Infomatic at global logistics and aviation industry events. See our upcoming conferences, exhibitions, and speaking engagements.',
    keywords: 'logistics events, aviation conferences, cargo exhibitions, industry conferences' },
  { src: 'media_inquiries_press_brand_assets_hub', out: 'company/media.html',
    title: 'Media & Press — Brand Assets & News | Hans Infomatic',
    desc: 'Access Hans Infomatic press releases, media kits, brand assets, and contact our communications team for media inquiries.',
    keywords: 'Hans Infomatic press, media kit, brand assets, press releases' },

  // ── Legal ──
  { src: 'privacy_policy_data_governance_protection', out: 'legal/privacy.html',
    title: 'Privacy Policy — Data Governance & Protection | Hans Infomatic',
    desc: 'Hans Infomatic\'s privacy policy explains how we collect, use, store, and protect your personal data in compliance with GDPR and global regulations.',
    keywords: 'privacy policy, data protection, GDPR, data governance' },
  { src: 'terms_of_service_global_operations_agreement', out: 'legal/terms.html',
    title: 'Terms of Service — Global Operations Agreement | Hans Infomatic',
    desc: 'Read Hans Infomatic\'s terms of service covering software licensing, usage policies, and operational agreements for our global platform.',
    keywords: 'terms of service, software license, usage agreement, legal terms' },
  { src: 'cookie_policy_transparency_personalization', out: 'legal/cookies.html',
    title: 'Cookie Policy — Transparency & Personalization | Hans Infomatic',
    desc: 'Understand how Hans Infomatic uses cookies and tracking technologies to improve your experience and personalize our services.',
    keywords: 'cookie policy, tracking, cookies, personalization' },
];

// ─── Shared Navigation HTML ────────────────────────────────────
function getNav(currentPath) {
  // Calculate relative root path
  const depth = currentPath.split('/').length - 1;
  const root = depth === 0 ? './' : '../'.repeat(depth);

  // Helper: active class
  const isActive = (prefix) => {
    if (prefix === '' && currentPath === 'index.html') return true;
    if (prefix && currentPath.startsWith(prefix)) return true;
    return false;
  };

  const activeClass = 'text-[#006c49] font-bold';
  const normalClass = 'text-[#171c1f] opacity-80 hover:text-[#10b981] transition-colors duration-300';

  return `<!-- Navigation -->
<nav class="fixed top-0 w-full z-50 bg-[#f5fafe]/80 backdrop-blur-xl shadow-[0_20px_40px_rgba(0,108,73,0.04)]">
  <div class="flex justify-between items-center px-6 md:px-12 py-5 max-w-screen-2xl mx-auto">
    <a href="${root}index.html" class="text-2xl font-bold tracking-tighter text-[#171c1f] font-headline hover:opacity-80 transition-all">
      Hans Infomatic
    </a>
    <div class="hidden lg:flex items-center space-x-8 font-headline font-medium text-sm tracking-tight">
      <!-- Products Dropdown -->
      <div class="relative group">
        <a href="${root}products/index.html" class="${isActive('products') ? activeClass : normalClass} flex items-center gap-1 py-2">
          Products <span class="material-symbols-outlined text-xs">expand_more</span>
        </a>
        <div class="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
          <div class="bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_60px_rgba(0,108,73,0.12)] border border-outline-variant/10 p-6 w-[680px] grid grid-cols-3 gap-x-8 gap-y-3">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-3 px-3">Freight & Cargo</p>
              <a href="${root}products/icaffe/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">iCAFFE</a>
              <a href="${root}products/wisecargo/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">WiseCargo</a>
              <a href="${root}products/wiseccs/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">WiseCCS</a>
              <a href="${root}products/ams/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">AMS</a>
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-3 px-3">Operations</p>
              <a href="${root}products/bagtrack/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">BagTrack</a>
              <a href="${root}products/wisefleet/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">WiseFleet</a>
              <a href="${root}products/wisestox/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">WiseSTOX</a>
              <a href="${root}products/wisehandling/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">WiseHandling</a>
              <a href="${root}products/wisedo/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">WiseDO</a>
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-3 px-3">Enterprise</p>
              <a href="${root}products/wisedox/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">WiseDOX</a>
              <a href="${root}products/wisegsa/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">WiseGSA</a>
              <a href="${root}products/wisehrms/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">WiseHRMS</a>
              <a href="${root}products/vms/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">VMS</a>
              <a href="${root}products/crmexpert/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">CRMExpert</a>
              <a href="${root}products/e-annex-ultra/index.html" class="block px-3 py-2 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">E-Annex Ultra</a>
            </div>
          </div>
        </div>
      </div>
      <!-- Industries Dropdown -->
      <div class="relative group">
        <a href="${root}industries/index.html" class="${isActive('industries') ? activeClass : normalClass} flex items-center gap-1 py-2">
          Industries <span class="material-symbols-outlined text-xs">expand_more</span>
        </a>
        <div class="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
          <div class="bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_60px_rgba(0,108,73,0.12)] border border-outline-variant/10 p-6 w-[280px]">
            <a href="${root}industries/airlines-gsas.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Airlines & GSAs</a>
            <a href="${root}industries/freight-forwarders.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Freight Forwarders</a>
            <a href="${root}industries/customs-brokers.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Customs Brokers</a>
            <a href="${root}industries/terminal-operators.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Terminal Operators</a>
            <a href="${root}industries/carriers.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Carriers</a>
          </div>
        </div>
      </div>
      <!-- Company Dropdown -->
      <div class="relative group">
        <a href="${root}company/about.html" class="${isActive('company') ? activeClass : normalClass} flex items-center gap-1 py-2">
          Company <span class="material-symbols-outlined text-xs">expand_more</span>
        </a>
        <div class="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
          <div class="bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_60px_rgba(0,108,73,0.12)] border border-outline-variant/10 p-6 w-[240px]">
            <a href="${root}company/about.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">About Us</a>
            <a href="${root}company/blog.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Blog</a>
            <a href="${root}company/case-studies.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Case Studies</a>
            <a href="${root}company/events.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Events</a>
            <a href="${root}company/media.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Media & Press</a>
          </div>
        </div>
      </div>
      <!-- Services -->
      <div class="relative group">
        <a href="${root}services/help-desk.html" class="${isActive('services') ? activeClass : normalClass} flex items-center gap-1 py-2">
          Services <span class="material-symbols-outlined text-xs">expand_more</span>
        </a>
        <div class="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
          <div class="bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_60px_rgba(0,108,73,0.12)] border border-outline-variant/10 p-6 w-[280px]">
            <a href="${root}services/help-desk.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">24/7 Technical Support</a>
            <a href="${root}services/executive-consultation.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Executive Consultation</a>
            <a href="${root}services/ai-intelligence.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">AI Intelligence</a>
            <a href="${root}services/security.html" class="block px-3 py-2.5 rounded-xl hover:bg-surface-container-low text-sm text-on-surface hover:text-primary transition-all">Security Architecture</a>
          </div>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-4">
      <a href="${root}contact.html" class="hidden lg:block text-[#006c49] font-semibold text-sm hover:opacity-80 transition-all">Contact</a>
      <a href="${root}book-demo.html" class="bg-gradient-to-br from-primary to-primary-container text-white px-6 py-3 rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all hover:scale-105 active:scale-95">
        Book a Demo
      </a>
      <!-- Mobile Menu Toggle -->
      <button onclick="document.getElementById('mobile-menu').classList.toggle('hidden')" class="lg:hidden text-on-surface p-2">
        <span class="material-symbols-outlined text-2xl">menu</span>
      </button>
    </div>
  </div>
  <!-- Mobile Menu -->
  <div id="mobile-menu" class="hidden lg:hidden bg-white/95 backdrop-blur-xl border-t border-outline-variant/10 px-6 py-6 space-y-2">
    <a href="${root}products/index.html" class="block py-3 px-4 rounded-xl text-sm font-medium hover:bg-surface-container-low transition-all">Products</a>
    <a href="${root}industries/index.html" class="block py-3 px-4 rounded-xl text-sm font-medium hover:bg-surface-container-low transition-all">Industries</a>
    <a href="${root}company/about.html" class="block py-3 px-4 rounded-xl text-sm font-medium hover:bg-surface-container-low transition-all">Company</a>
    <a href="${root}services/help-desk.html" class="block py-3 px-4 rounded-xl text-sm font-medium hover:bg-surface-container-low transition-all">Services</a>
    <a href="${root}contact.html" class="block py-3 px-4 rounded-xl text-sm font-medium hover:bg-surface-container-low transition-all">Contact</a>
    <a href="${root}partner.html" class="block py-3 px-4 rounded-xl text-sm font-medium hover:bg-surface-container-low transition-all">Partner</a>
    <a href="${root}book-demo.html" class="block py-3 px-4 rounded-xl bg-gradient-to-br from-primary to-primary-container text-white text-sm font-bold text-center mt-4">Book a Demo</a>
  </div>
</nav>`;
}

// ─── Shared Footer HTML ────────────────────────────────────────
function getFooter(currentPath) {
  const depth = currentPath.split('/').length - 1;
  const root = depth === 0 ? './' : '../'.repeat(depth);

  return `<!-- Footer -->
<footer class="bg-[#e9eef2] w-full rounded-t-[2rem] mt-24">
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 px-6 md:px-12 py-20 max-w-screen-2xl mx-auto">
    <div class="sm:col-span-2 lg:col-span-1">
      <a href="${root}index.html" class="text-xl font-black text-[#171c1f] mb-6 block">Hans Infomatic</a>
      <p class="text-[#171c1f]/60 font-body text-sm leading-relaxed mb-8">
        Redefining logistics through intelligent automation and global digital connectivity. Founded on precision, driven by innovation.
      </p>
      <div class="flex gap-3">
        <a href="https://www.linkedin.com/company/hansinfomatic" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" class="w-9 h-9 bg-surface-container-high rounded-full flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
          <span class="material-symbols-outlined text-sm">share</span>
        </a>
        <a href="https://twitter.com/hansinfomatic" target="_blank" rel="noopener noreferrer" aria-label="Twitter" class="w-9 h-9 bg-surface-container-high rounded-full flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
          <span class="material-symbols-outlined text-sm">public</span>
        </a>
      </div>
    </div>
    <div>
      <h4 class="font-headline font-bold text-sm uppercase tracking-widest mb-6">Products</h4>
      <ul class="space-y-3 font-body text-sm">
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}products/icaffe/index.html">iCAFFE</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}products/bagtrack/index.html">BagTrack</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}products/wisecargo/index.html">WiseCargo</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}products/wisedox/index.html">WiseDOX</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}products/wisestox/index.html">WiseSTOX</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}products/wisefleet/index.html">WiseFleet</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}products/vms/index.html">VMS</a></li>
      </ul>
    </div>
    <div>
      <h4 class="font-headline font-bold text-sm uppercase tracking-widest mb-6">Industries</h4>
      <ul class="space-y-3 font-body text-sm">
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}industries/airlines-gsas.html">Airlines & GSAs</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}industries/freight-forwarders.html">Freight Forwarders</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}industries/customs-brokers.html">Customs Brokers</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}industries/terminal-operators.html">Terminal Operators</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}industries/carriers.html">Carriers</a></li>
      </ul>
    </div>
    <div>
      <h4 class="font-headline font-bold text-sm uppercase tracking-widest mb-6">Company</h4>
      <ul class="space-y-3 font-body text-sm">
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}company/about.html">About Us</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}company/blog.html">Blog</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}company/case-studies.html">Case Studies</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}company/events.html">Events</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}company/media.html">Media & Press</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}contact.html">Contact</a></li>
        <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}partner.html">Become a Partner</a></li>
      </ul>
    </div>
    <div>
      <h4 class="font-headline font-bold text-sm uppercase tracking-widest mb-6">Newsletter</h4>
      <p class="text-[#171c1f]/60 text-xs mb-4 leading-relaxed">Stay updated with the latest in logistics tech and industry insights.</p>
      <form onsubmit="event.preventDefault(); this.querySelector('input').value='Subscribed!'; this.querySelector('button').disabled=true;" class="flex items-center bg-surface-container-lowest p-1 rounded-xl">
        <input class="bg-transparent border-none focus:ring-0 text-sm px-4 w-full" placeholder="email@example.com" type="email" required aria-label="Email for newsletter"/>
        <button type="submit" class="bg-primary text-white p-2.5 rounded-lg hover:bg-primary-container transition-all" aria-label="Subscribe">
          <span class="material-symbols-outlined text-sm">send</span>
        </button>
      </form>
      <div class="mt-8">
        <h4 class="font-headline font-bold text-sm uppercase tracking-widest mb-4">Services</h4>
        <ul class="space-y-3 font-body text-sm">
          <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}services/help-desk.html">24/7 Support</a></li>
          <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}services/executive-consultation.html">Consultation</a></li>
          <li><a class="text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}services/ai-intelligence.html">AI Intelligence</a></li>
        </ul>
      </div>
    </div>
  </div>
  <div class="border-t border-outline-variant/10 max-w-screen-2xl mx-auto px-6 md:px-12 py-8 flex flex-col md:flex-row justify-between items-center gap-6">
    <p class="text-[#171c1f]/60 text-xs">&copy; ${new Date().getFullYear()} Hans Infomatic. All rights reserved.</p>
    <div class="flex flex-wrap gap-6 justify-center">
      <a class="text-xs text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}legal/privacy.html">Privacy Policy</a>
      <a class="text-xs text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}legal/terms.html">Terms of Service</a>
      <a class="text-xs text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}services/security.html">Security</a>
      <a class="text-xs text-[#171c1f]/60 hover:text-[#006c49] transition-all" href="${root}legal/cookies.html">Cookie Policy</a>
    </div>
  </div>
</footer>`;
}

// ─── Head Template ─────────────────────────────────────────────
function getHead(page) {
  const canonicalUrl = `${DOMAIN}/${page.out === 'index.html' ? '' : page.out}`;
  const ogImage = `${DOMAIN}/assets/og-default.png`;

  return `<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>${page.title}</title>
<meta name="description" content="${page.desc}"/>
<meta name="keywords" content="${page.keywords}"/>
<meta name="author" content="Hans Infomatic"/>
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"/>
<link rel="canonical" href="${canonicalUrl}"/>

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website"/>
<meta property="og:url" content="${canonicalUrl}"/>
<meta property="og:title" content="${page.title}"/>
<meta property="og:description" content="${page.desc}"/>
<meta property="og:image" content="${ogImage}"/>
<meta property="og:site_name" content="Hans Infomatic"/>
<meta property="og:locale" content="en_US"/>

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:url" content="${canonicalUrl}"/>
<meta name="twitter:title" content="${page.title}"/>
<meta name="twitter:description" content="${page.desc}"/>
<meta name="twitter:image" content="${ogImage}"/>

<!-- Fonts & Icons -->
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=Inter:wght@300;400;500;600&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>

<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<script>
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface-container-high":"#e4e9ed","surface-bright":"#f5fafe","on-tertiary":"#ffffff",
        "tertiary":"#5f5e5e","on-error":"#ffffff","on-background":"#171c1f",
        "tertiary-container":"#a4a2a2","surface":"#f5fafe","secondary-container":"#a0f3d7",
        "on-surface-variant":"#3c4a42","secondary-fixed-dim":"#84d6bc",
        "on-error-container":"#93000a","primary":"#006c49","on-primary":"#ffffff",
        "primary-container":"#10b981","background":"#f5fafe","on-tertiary-fixed":"#1b1c1c",
        "surface-tint":"#006c49","on-primary-fixed":"#002113",
        "on-primary-container":"#00422b","on-secondary-fixed":"#002018",
        "on-primary-fixed-variant":"#005236","tertiary-fixed":"#e4e2e1",
        "on-secondary-container":"#15715c","secondary":"#086b56",
        "surface-variant":"#dee3e7","inverse-primary":"#4edea3","on-secondary":"#ffffff",
        "inverse-on-surface":"#ecf1f5","outline":"#6c7a71",
        "tertiary-fixed-dim":"#c8c6c6","on-tertiary-container":"#393939",
        "on-surface":"#171c1f","primary-fixed":"#6ffbbe","primary-fixed-dim":"#4edea3",
        "surface-dim":"#d5dbdf","error-container":"#ffdad6","inverse-surface":"#2c3134",
        "error":"#ba1a1a","outline-variant":"#bbcabf","surface-container":"#e9eef2",
        "surface-container-low":"#eff4f8","on-secondary-fixed-variant":"#005140",
        "surface-container-lowest":"#ffffff","surface-container-highest":"#dee3e7",
        "on-tertiary-fixed-variant":"#474747","secondary-fixed":"#a0f3d7"
      },
      fontFamily: {"headline":["Plus Jakarta Sans"],"body":["Inter"],"label":["Inter"]},
      borderRadius: {"DEFAULT":"0.25rem","lg":"0.5rem","xl":"0.75rem","full":"9999px"},
    },
  },
}
</script>
<style>
  .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
  .editorial-shadow { box-shadow: 0 20px 40px rgba(0, 108, 73, 0.06); }
  .glass-nav { backdrop-filter: blur(12px); }
  .glass-card { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(12px); }
  .glass-effect { background: rgba(245, 250, 254, 0.85); backdrop-filter: blur(16px); }
  .hero-gradient { background: linear-gradient(135deg, #006c49 0%, #10b981 100%); }
  .text-gradient { background: linear-gradient(135deg, #006c49 0%, #10b981 50%, #4edea3 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  html { scroll-behavior: smooth; }
</style>`;
}

// ─── Schema.org Structured Data ────────────────────────────────
function getStructuredData(page) {
  const canonicalUrl = `${DOMAIN}/${page.out === 'index.html' ? '' : page.out}`;

  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Hans Infomatic",
    "url": DOMAIN,
    "logo": `${DOMAIN}/assets/logo.png`,
    "description": "Digital Intelligence for Global Cargo & Logistics",
    "contactPoint": { "@type": "ContactPoint", "contactType": "customer service", "availableLanguage": ["English"] },
    "sameAs": ["https://www.linkedin.com/company/hansinfomatic", "https://twitter.com/hansinfomatic"]
  };

  const webpage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": page.title,
    "description": page.desc,
    "url": canonicalUrl,
    "publisher": { "@type": "Organization", "name": "Hans Infomatic" }
  };

  // Add BreadcrumbList
  const parts = page.out.replace(/\/index\.html$/, '').replace(/\.html$/, '').split('/').filter(Boolean);
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": DOMAIN }
    ]
  };
  let pathSoFar = DOMAIN;
  parts.forEach((part, i) => {
    pathSoFar += '/' + part;
    breadcrumbs.itemListElement.push({
      "@type": "ListItem",
      "position": i + 2,
      "name": part.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      "item": pathSoFar
    });
  });

  let scripts = `<script type="application/ld+json">${JSON.stringify(webpage)}</script>\n`;
  scripts += `<script type="application/ld+json">${JSON.stringify(breadcrumbs)}</script>\n`;
  if (page.out === 'index.html') {
    scripts += `<script type="application/ld+json">${JSON.stringify(org)}</script>\n`;
  }
  // FAQ pages get FAQPage schema placeholder
  if (page.out.includes('faq')) {
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": []
    };
    scripts += `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>\n`;
  }
  return scripts;
}

// ─── Process a single page ─────────────────────────────────────
function processPage(page) {
  const srcPath = path.join(ROOT, page.src, 'code.html');
  if (!fs.existsSync(srcPath)) {
    console.warn(`  SKIP: ${srcPath} not found`);
    return;
  }

  let html = fs.readFileSync(srcPath, 'utf-8');

  // Extract body content (between <body...> and </body>)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) {
    console.warn(`  SKIP: No body found in ${page.src}`);
    return;
  }
  let bodyContent = bodyMatch[1];

  // Remove existing nav (everything from first <nav to </nav>)
  bodyContent = bodyContent.replace(/<nav[\s\S]*?<\/nav>/i, '');

  // Remove existing footer
  bodyContent = bodyContent.replace(/<footer[\s\S]*?<\/footer>/i, '');

  // Remove existing mobile menu if any standalone
  bodyContent = bodyContent.replace(/<div[^>]*id="mobile-menu"[\s\S]*?<\/div>\s*<\/div>/gi, '');

  // Build the complete page
  const outHtml = `<!DOCTYPE html>
<html class="light" lang="en">
<head>
${getHead(page)}
${getStructuredData(page)}
</head>
<body class="bg-surface font-body text-on-surface antialiased">
${getNav(page.out)}
${bodyContent.trim()}
${getFooter(page.out)}
<!-- Back to Top -->
<button onclick="window.scrollTo({top:0,behavior:'smooth'})" id="back-to-top" class="fixed bottom-8 right-8 z-40 bg-primary text-white w-12 h-12 rounded-full shadow-lg shadow-primary/20 flex items-center justify-center opacity-0 pointer-events-none transition-all hover:scale-110" aria-label="Back to top">
  <span class="material-symbols-outlined">arrow_upward</span>
</button>
<script>
  // Back to top button
  const btn = document.getElementById('back-to-top');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 600) { btn.style.opacity='1'; btn.style.pointerEvents='auto'; }
    else { btn.style.opacity='0'; btn.style.pointerEvents='none'; }
  });
</script>
<!-- Form Handler -->
<script src="${(page.out.split('/').length - 1) === 0 ? './' : '../'.repeat(page.out.split('/').length - 1)}js/supabase-config.js"></script>
</body>
</html>`;

  // Write output
  const outPath = path.join(OUT, page.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, outHtml, 'utf-8');
  console.log(`  OK: ${page.out}`);
}

// ─── Generate sitemap.xml ──────────────────────────────────────
function generateSitemap() {
  const today = new Date().toISOString().split('T')[0];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
  pages.forEach(page => {
    const url = `${DOMAIN}/${page.out === 'index.html' ? '' : page.out}`;
    const priority = page.out === 'index.html' ? '1.0' :
                     page.out.split('/').length <= 2 ? '0.8' : '0.6';
    const changefreq = page.out === 'index.html' ? 'weekly' :
                       page.out.includes('blog') ? 'weekly' :
                       page.out.includes('legal') ? 'yearly' : 'monthly';
    xml += `  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>
`;
  });
  xml += `</urlset>`;
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), xml, 'utf-8');
  console.log('  OK: sitemap.xml');
}

// ─── Generate robots.txt ───────────────────────────────────────
function generateRobots() {
  const content = `User-agent: *
Allow: /
Disallow: /assets/

Sitemap: ${DOMAIN}/sitemap.xml
`;
  fs.writeFileSync(path.join(OUT, 'robots.txt'), content, 'utf-8');
  console.log('  OK: robots.txt');
}

// ─── Generate manifest.json ────────────────────────────────────
function generateManifest() {
  const manifest = {
    "name": "Hans Infomatic",
    "short_name": "HansInfo",
    "description": "Digital Intelligence for Global Cargo & Logistics",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#f5fafe",
    "theme_color": "#006c49",
    "icons": [
      { "src": "/assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
      { "src": "/assets/icon-512.png", "sizes": "512x512", "type": "image/png" }
    ]
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('  OK: manifest.json');
}

// ─── Main ──────────────────────────────────────────────────────
console.log('\n🔨 Building Hans Infomatic Website...\n');
console.log(`  Source: ${ROOT}`);
console.log(`  Output: ${OUT}`);
console.log(`  Pages:  ${pages.length}\n`);

// Clean output (preserve .vercel and js directories)
if (fs.existsSync(OUT)) {
  const items = fs.readdirSync(OUT);
  for (const item of items) {
    if (item === '.vercel' || item === 'js') continue;
    const p = path.join(OUT, item);
    fs.rmSync(p, { recursive: true, force: true });
  }
} else {
  fs.mkdirSync(OUT, { recursive: true });
}

// Process all pages
pages.forEach(processPage);

console.log('');

// Generate SEO files
generateSitemap();
generateRobots();
generateManifest();

// Create assets placeholder directory
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });

console.log(`\n✅ Build complete! ${pages.length} pages generated.\n`);
console.log(`  Open: ${path.join(OUT, 'index.html')}\n`);
