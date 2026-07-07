-- LoanPro Full Database Creation Script
-- PostgreSQL Dialect

-- 1. UTILITIES & FUNCTIONS
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. MASTER TABLES
-- Branches Master
CREATE TABLE IF NOT EXISTS branches (
    id BIGINT PRIMARY KEY,
    branch_code VARCHAR(50) UNIQUE NOT NULL,
    branch_name VARCHAR(255) NOT NULL,
    address TEXT,
    contact_number VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Roles Master
CREATE TABLE IF NOT EXISTS roles (
    id BIGINT PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users Master
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    mobile_number VARCHAR(20),
    role_id BIGINT REFERENCES roles(id),
    branch_id BIGINT REFERENCES branches(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Loan Types Master
CREATE TABLE IF NOT EXISTS loan_types (
    id BIGINT PRIMARY KEY,
    type_code VARCHAR(50) UNIQUE NOT NULL,
    type_name VARCHAR(255) NOT NULL,
    description TEXT,
    interest_rate DECIMAL(5, 2),
    max_tenure_months INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. CORE PROPOSALS
CREATE TABLE IF NOT EXISTS proposals (
    id BIGINT PRIMARY KEY,
    is_existing_customer BOOLEAN DEFAULT FALSE,
    customer_id_or_pan VARCHAR(50),
    applicant_name VARCHAR(255) NOT NULL,
    gender VARCHAR(20),
    education VARCHAR(100),
    dob DATE,
    age INTEGER,
    pan_number VARCHAR(20),
    grading VARCHAR(50),
    aadhaar_number VARCHAR(20),
    mid_number VARCHAR(50),
    ckyc_number VARCHAR(50),
    email_id VARCHAR(255),
    mobile_no VARCHAR(20),
    loan_type VARCHAR(100),
    requested_amount NUMERIC(15, 2),
    requested_amount_words TEXT,
    reason_of_loan TEXT,
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tab Master
CREATE TABLE IF NOT EXISTS tab_master (
    id BIGINT PRIMARY KEY,
    key VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Proposal Tab Mapping (Completion Status)
CREATE TABLE IF NOT EXISTS proposal_tab_mapping (
    id BIGINT PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    tab_id BIGINT NOT NULL REFERENCES tab_master(id) ON DELETE CASCADE,
    is_filled BOOLEAN DEFAULT FALSE,
    is_mandatory BOOLEAN DEFAULT TRUE,
    sort_order INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_proposal_tab UNIQUE (proposal_id, tab_id)
);

-- Proposal Participants (Guarantors & Co-borrowers)
CREATE TABLE IF NOT EXISTS proposal_participants (
    id SERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) NOT NULL, -- 'G' for Guarantor, 'C' for Co-borrower
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_entity_type CHECK (entity_type IN ('G', 'C'))
);

-- 4. PROPOSAL DETAIL TABLES
-- Personal Information
CREATE TABLE IF NOT EXISTS proposal_personal_info (
    id SERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) DEFAULT 'B', -- 'B' for Borrower, 'G' for Guarantor, 'C' for Co-borrower
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    
    religion VARCHAR(50),
    cast_name VARCHAR(100),
    education VARCHAR(100),
    marital_status VARCHAR(50),
    is_bank_member BOOLEAN DEFAULT FALSE,
    member_type VARCHAR(50),
    membership_date DATE,
    member_no VARCHAR(50),
    bank_shares_amount NUMERIC(15, 2),
    family_members_count INTEGER,
    earners_out_of_them INTEGER,
    net_worth_amount NUMERIC(15, 2),
    net_worth_date DATE,
    profession VARCHAR(150),
    relation_with_director VARCHAR(150),
    mobile_no_2 VARCHAR(20),
    full_address TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_personal_entity UNIQUE (proposal_id, entity_type, participant_id)
);

-- Loan Specific Info
CREATE TABLE IF NOT EXISTS proposal_loan_info (
    proposal_id BIGINT PRIMARY KEY REFERENCES proposals(id) ON DELETE CASCADE,
    loan_type VARCHAR(50),
    reason_of_loan TEXT,
    requested_amount NUMERIC(15, 2),
    requested_amount_words TEXT,
    installment_type VARCHAR(50),
    duration_months INTEGER,
    interest_rate NUMERIC(5, 2),
    monthly_installment NUMERIC(15, 2),
    has_moratorium BOOLEAN DEFAULT FALSE,
    moratorium_period INTEGER,
    has_insurance BOOLEAN DEFAULT FALSE,
    insurance_amount NUMERIC(15, 2) DEFAULT 0,
    total_requested_amount NUMERIC(15, 2) DEFAULT 0,
    is_participation_loan BOOLEAN DEFAULT FALSE,

    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bank Scheme MIS Details
CREATE TABLE IF NOT EXISTS proposal_bank_scheme (
    proposal_id BIGINT PRIMARY KEY REFERENCES proposals(id) ON DELETE CASCADE,
    loan_type VARCHAR(100),
    bank_loan_scheme_type VARCHAR(255),
    industry_marking VARCHAR(255),
    priority_sector_marking VARCHAR(255),
    weaker_sector VARCHAR(255),
    real_estate_marking VARCHAR(255),
    priority_code TEXT,
    weaker_code TEXT,
    real_estate_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Participation Loan Details
CREATE TABLE IF NOT EXISTS proposal_loan_participation (
    id BIGINT PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    bank_name VARCHAR(255),
    role VARCHAR(100),
    loan_type VARCHAR(100),
    sanctioned_amount NUMERIC(15, 2) DEFAULT 0,
    outstanding_amount NUMERIC(15, 2) DEFAULT 0,
    share_percent NUMERIC(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Higher Purchase Loan Data (Loan Specific Info - Global Settings)
CREATE TABLE IF NOT EXISTS higher_purchase_loan_data (
    proposal_id BIGINT PRIMARY KEY REFERENCES proposals(id) ON DELETE CASCADE,
    machinery_condition VARCHAR(10) DEFAULT 'new', -- 'new' or 'old'
    has_gst_input BOOLEAN DEFAULT FALSE,
    gst_input_percentage NUMERIC(5, 2) DEFAULT 0,
    gst_input_amount NUMERIC(15, 2) DEFAULT 0,
    is_hypothecated BOOLEAN DEFAULT FALSE,
    mortgage_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Machinery Detail (Loan Specific Info - Asset List)
CREATE TABLE IF NOT EXISTS proposal_machinery_info (
    id BIGINT PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    quotation_date DATE,
    vendor_name VARCHAR(255),
    machinery_details TEXT,
    machinery_price NUMERIC(15, 2) DEFAULT 0,
    gst_amount NUMERIC(15, 2) DEFAULT 0,
    total_amount NUMERIC(15, 2) DEFAULT 0,
    
    -- Old Machinery Specific
    valuation_amount NUMERIC(15, 2) DEFAULT 0,
    valuation_date DATE,
    valuer_name VARCHAR(255),
    age_of_machinery VARCHAR(100),
    future_life_of_machinery VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Financial Information
CREATE TABLE IF NOT EXISTS proposal_financial_info (
    id SERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) DEFAULT 'B',
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    
    bank_name VARCHAR(255),
    account_number VARCHAR(100),
    is_itr_filed BOOLEAN DEFAULT FALSE,
    itr_financial_year VARCHAR(20),
    itr_income_amount NUMERIC(15, 2) DEFAULT 0,
    itr_tax_amount NUMERIC(15, 2) DEFAULT 0,
    pays_property_tax BOOLEAN DEFAULT FALSE,
    wealth_amount NUMERIC(15, 2) DEFAULT 0,
    property_tax_amount NUMERIC(15, 2) DEFAULT 0,
    last_assessment_year VARCHAR(10),
    has_investments BOOLEAN DEFAULT FALSE,
    investment_details TEXT,
    has_cibil BOOLEAN DEFAULT FALSE,
    cibil_type VARCHAR(100),
    cibil_date DATE,
    cibil_cmr VARCHAR(100),
    cibil_details TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_financial_entity UNIQUE (proposal_id, entity_type, participant_id)
);

-- Credit Information
CREATE TABLE IF NOT EXISTS proposal_credit_info (
    id SERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) DEFAULT 'B',
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    
    has_loan_in_this_bank BOOLEAN DEFAULT FALSE,
    has_loan_in_other_banks BOOLEAN DEFAULT FALSE,
    has_guarantee_in_this_bank BOOLEAN DEFAULT FALSE,
    has_guarantee_in_other_banks BOOLEAN DEFAULT FALSE,
    has_previous_loan_in_this_bank BOOLEAN DEFAULT FALSE,
    has_previous_loan_in_other_banks BOOLEAN DEFAULT FALSE,
    has_account_in_this_bank BOOLEAN DEFAULT FALSE,
    has_account_in_other_banks BOOLEAN DEFAULT FALSE,
    has_life_insurance BOOLEAN DEFAULT FALSE,
    will_do_new_insurance BOOLEAN DEFAULT FALSE,
    has_roc_debt_record BOOLEAN DEFAULT FALSE,
    has_no_dues_certificate BOOLEAN DEFAULT FALSE,
    no_dues_certificate_details TEXT,
    has_other_collateral BOOLEAN DEFAULT FALSE,
    other_collateral_details TEXT,
    has_loan_statement BOOLEAN DEFAULT FALSE,
    has_other_mortgage_share BOOLEAN DEFAULT FALSE,
    other_mortgage_share_details TEXT,

    loans_this_bank_remarks TEXT,
    loans_other_banks_remarks TEXT,
    guarantees_this_bank_remarks TEXT,
    guarantees_other_banks_remarks TEXT,
    previous_loans_this_bank_remarks TEXT,
    previous_loans_other_banks_remarks TEXT,
    accounts_this_bank_remarks TEXT,
    accounts_other_banks_remarks TEXT,
    life_insurance_remarks TEXT,
    new_insurance_remarks TEXT,
    roc_debts_remarks TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_credit_entity UNIQUE (proposal_id, entity_type, participant_id)
);

-- Credit - Loans in This Bank
CREATE TABLE IF NOT EXISTS proposal_credit_loans_this_bank (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES branches(id),
    account_no VARCHAR(100),
    loan_type_id BIGINT REFERENCES loan_types(id),
    sanctioned_amount NUMERIC(15, 2) DEFAULT 0,
    amount_paid NUMERIC(15, 2) DEFAULT 0,
    installment_amount NUMERIC(15, 2) DEFAULT 0,
    loan_outstanding NUMERIC(15, 2) DEFAULT 0,
    loan_overdue_amount NUMERIC(15, 2) DEFAULT 0,
    due_maturity_date DATE,
    is_timely_repayment BOOLEAN DEFAULT TRUE,
    disbursement_date DATE,
    mortgage_details TEXT,
    will_repay_loan BOOLEAN DEFAULT TRUE,
    excess_collateral_details TEXT,
    reported_to_cibil BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit - Loans in Other Banks
CREATE TABLE IF NOT EXISTS proposal_credit_loans_other_banks (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    bank_category VARCHAR(50), -- coop | nationalised
    is_society_member BOOLEAN DEFAULT FALSE,
    bank_institute_name VARCHAR(255),
    branch_name VARCHAR(255),
    account_no VARCHAR(100),
    loan_type VARCHAR(255),
    sanctioned_amount NUMERIC(15, 2) DEFAULT 0,
    amount_paid NUMERIC(15, 2) DEFAULT 0,
    installment_amount NUMERIC(15, 2) DEFAULT 0,
    loan_outstanding NUMERIC(15, 2) DEFAULT 0,
    loan_overdue_amount NUMERIC(15, 2) DEFAULT 0,
    due_maturity_date DATE,
    is_timely_repayment BOOLEAN DEFAULT TRUE,
    mortgage_details TEXT,
    will_repay_loan BOOLEAN DEFAULT TRUE,
    reported_to_cibil BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit - Loan Guarantees in This Bank
CREATE TABLE IF NOT EXISTS proposal_credit_guarantees_this_bank (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES branches(id),
    account_no VARCHAR(100),
    borrower_name VARCHAR(255),
    loan_type_id BIGINT REFERENCES loan_types(id),
    sanctioned_amount NUMERIC(15, 2) DEFAULT 0,
    loan_outstanding NUMERIC(15, 2) DEFAULT 0,
    loan_overdue_amount NUMERIC(15, 2) DEFAULT 0,
    due_maturity_date DATE,
    is_timely_repayment BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit - Loan Guarantees in Other Banks
CREATE TABLE IF NOT EXISTS proposal_credit_guarantees_other_banks (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    bank_category VARCHAR(50), -- coop | nationalised
    is_society_member BOOLEAN DEFAULT FALSE,
    bank_institute_name VARCHAR(255),
    branch_name VARCHAR(255),
    account_no VARCHAR(100),
    borrower_name VARCHAR(255),
    loan_type VARCHAR(255),
    sanctioned_amount NUMERIC(15, 2) DEFAULT 0,
    loan_outstanding NUMERIC(15, 2) DEFAULT 0,
    loan_overdue_amount NUMERIC(15, 2) DEFAULT 0,
    due_maturity_date DATE,
    is_timely_repayment BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit - Previous Loans in This Bank (Closed)
CREATE TABLE IF NOT EXISTS proposal_credit_loans_previous_this_bank (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES branches(id),
    reason_of_loan TEXT,
    loan_type_id BIGINT REFERENCES loan_types(id),
    sanctioned_amount NUMERIC(15, 2) DEFAULT 0,
    sanctioned_date DATE,
    account_close_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit - Previous Loans in Other Banks (Closed)
CREATE TABLE IF NOT EXISTS proposal_credit_loans_previous_other_banks (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    bank_name VARCHAR(255),
    branch_name VARCHAR(255),
    reason_of_loan TEXT,
    loan_type VARCHAR(255),
    sanctioned_amount NUMERIC(15, 2) DEFAULT 0,
    sanctioned_date DATE,
    account_close_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit - Accounts in This Bank
CREATE TABLE IF NOT EXISTS proposal_credit_accounts_this_bank (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES branches(id),
    account_type VARCHAR(100), -- savings | current | term | recurring | monthly | daily | other
    account_no VARCHAR(100),
    opening_date DATE,
    amount NUMERIC(15, 2) DEFAULT 0,
    is_mortgaged_for_this_loan BOOLEAN DEFAULT FALSE,
    is_prime_security BOOLEAN DEFAULT FALSE,
    is_collateral_security BOOLEAN DEFAULT FALSE,
    expiration_date DATE,
    is_loan_taken_on_this_bank_deposit BOOLEAN DEFAULT FALSE,
    loan_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit - Accounts in Other Banks
CREATE TABLE IF NOT EXISTS proposal_credit_accounts_other_banks (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    bank_category VARCHAR(50), -- coop | nationalised
    is_society_member BOOLEAN DEFAULT FALSE,
    bank_name VARCHAR(255),
    branch_name VARCHAR(255),
    account_type VARCHAR(100), -- savings | current | term | recurring | monthly | daily | other
    account_no VARCHAR(100),
    opening_date DATE,
    amount NUMERIC(15, 2) DEFAULT 0,
    is_mortgaged_for_this_loan BOOLEAN DEFAULT FALSE,
    is_prime_security BOOLEAN DEFAULT FALSE,
    is_collateral_security BOOLEAN DEFAULT FALSE,
    expiration_date DATE,
    is_loan_taken_on_this_bank_deposit BOOLEAN DEFAULT FALSE,
    loan_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit - Life Insurance
CREATE TABLE IF NOT EXISTS proposal_life_insurance (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    insurance_date DATE,
    maturity_date DATE,
    company_name VARCHAR(255),
    policy_number VARCHAR(100),
    policy_amount NUMERIC(15, 2) DEFAULT 0,
    installment_amount NUMERIC(15, 2) DEFAULT 0,
    premium_amount_yearly NUMERIC(15, 2) DEFAULT 0,
    premium_mode VARCHAR(50), -- yearly | quarterly | monthly
    amount_paid_till_date NUMERIC(15, 2) DEFAULT 0,
    has_loan BOOLEAN DEFAULT FALSE,
    loan_remaining_amount NUMERIC(15, 2) DEFAULT 0,
    will_assign_policy BOOLEAN DEFAULT FALSE,
    non_assignment_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit - New Insurance
CREATE TABLE IF NOT EXISTS proposal_new_insurance (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    insurance_date DATE,
    maturity_date DATE,
    company_name VARCHAR(255),
    policy_number VARCHAR(100),
    policy_amount NUMERIC(15, 2) DEFAULT 0,
    premium_amount NUMERIC(15, 2) DEFAULT 0,
    premium_amount_yearly NUMERIC(15, 2) DEFAULT 0,
    premium_mode VARCHAR(50), -- yearly | quarterly | monthly
    amount_paid_till_date NUMERIC(15, 2) DEFAULT 0,
    will_assign_policy BOOLEAN DEFAULT FALSE,
    is_loan_sought_for_premium BOOLEAN DEFAULT FALSE,
    non_assignment_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit - ROC Debt Records
CREATE TABLE IF NOT EXISTS proposal_roc_debts (
    id SERIAL PRIMARY KEY,
    credit_info_id BIGINT NOT NULL REFERENCES proposal_credit_info(id) ON DELETE CASCADE,
    srn VARCHAR(100),
    charge_id VARCHAR(100),
    creation_date DATE,
    charge_amount NUMERIC(15, 2) DEFAULT 0,
    charge_holder VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- Property Information
CREATE TABLE IF NOT EXISTS proposal_property_info (
    id BIGINT PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) DEFAULT 'B',
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    owner_name VARCHAR(255) NOT NULL,
    relationship_with_borrower VARCHAR(150),
    nature_of_property VARCHAR(20),
    property_type VARCHAR(100),
    total_area NUMERIC(15, 2),
    area_unit_total VARCHAR(50),
    part NUMERIC(15, 2) DEFAULT 0,
    area_unit_part VARCHAR(50),
    group_survey_number VARCHAR(100),
    sara VARCHAR(100),
    monthly_rent NUMERIC(15, 2),
    construction_area NUMERIC(15, 2),
    direction_east VARCHAR(255),
    direction_west VARCHAR(255),
    direction_south VARCHAR(255),
    direction_north VARCHAR(255),
    details TEXT,
    is_prime_security BOOLEAN DEFAULT TRUE,
    is_tax_paid BOOLEAN DEFAULT FALSE,
    is_mortgaged_other BOOLEAN DEFAULT FALSE,
    other_bank_name VARCHAR(255),
    other_loan_total_amount NUMERIC(15, 2) DEFAULT 0,
    other_loan_due_amount NUMERIC(15, 2) DEFAULT 0,
    has_legal_opinion BOOLEAN DEFAULT FALSE,
    panel_advocate VARCHAR(255),
    legal_opinion_date DATE,
    search_receipt_number VARCHAR(100),
    search_receipt_date DATE,
    is_suitable_for_mortgage BOOLEAN DEFAULT FALSE,
    legal_opinion_details TEXT,
    has_second_legal_opinion BOOLEAN DEFAULT FALSE,
    second_panel_advocate VARCHAR(255),
    second_legal_opinion_date DATE,
    second_search_receipt_number VARCHAR(100),
    second_search_receipt_date DATE,
    second_is_suitable_for_mortgage BOOLEAN DEFAULT FALSE,
    second_legal_opinion_details TEXT,
    visit_report_done BOOLEAN DEFAULT FALSE,
    visitor_name VARCHAR(255),
    visit_date DATE,
    visit_details TEXT,
    valuation_done BOOLEAN DEFAULT FALSE,
    valuator_name VARCHAR(255),
    market_value NUMERIC(15, 2) DEFAULT 0,
    realizable_value NUMERIC(15, 2) DEFAULT 0,
    distress_value NUMERIC(15, 2) DEFAULT 0,
    government_value NUMERIC(15, 2) DEFAULT 0,
    valuation_date DATE,
    paiki_plot_value NUMERIC(15, 2),
    building_value NUMERIC(15, 2),
    building_age INTEGER,
    future_life INTEGER,
    second_valuation_done BOOLEAN DEFAULT FALSE,
    second_valuator_name VARCHAR(255),
    second_market_value NUMERIC(15, 2) DEFAULT 0,
    second_realizable_value NUMERIC(15, 2) DEFAULT 0,
    second_distress_value NUMERIC(15, 2) DEFAULT 0,
    second_government_value NUMERIC(15, 2) DEFAULT 0,
    second_valuation_date DATE,
    second_paiki_plot_value NUMERIC(15, 2),
    second_building_value NUMERIC(15, 2),
    second_building_age INTEGER,
    second_future_life INTEGER,
    purchase_date DATE,
    purchase_order_number VARCHAR(100),
    purchase_amount NUMERIC(15, 2),
    seller_name VARCHAR(255),
    income_description VARCHAR(255),
    landmark VARCHAR(255),
    state_id VARCHAR(50),
    district_id VARCHAR(50),
    taluka_id VARCHAR(50),
    village VARCHAR(150),
    pincode VARCHAR(10),
    remark TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. INCOME MODULE TABLES
-- Job Income
CREATE TABLE IF NOT EXISTS proposal_income_job (
    id BIGINT PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) DEFAULT 'B',
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    organization_name VARCHAR(255),
    organization_contact VARCHAR(20),
    branch VARCHAR(100),
    department VARCHAR(100),
    designation VARCHAR(100),
    token_number VARCHAR(50),
    branch_address TEXT,
    branch_contact VARCHAR(20),
    job_details TEXT,
    job_type VARCHAR(50),
    nature_of_job VARCHAR(50),
    service_date DATE,
    retirement_date DATE,
    last_salary_month VARCHAR(50),
    permanent_date DATE,
    has_salary_proof BOOLEAN DEFAULT FALSE,
    years_employed INT,
    salary_grade VARCHAR(50),
    basic_salary NUMERIC(15, 2) DEFAULT 0,
    grade_pay NUMERIC(15, 2) DEFAULT 0,
    da_amount NUMERIC(15, 2) DEFAULT 0,
    hra_amount NUMERIC(15, 2) DEFAULT 0,
    other_allowance NUMERIC(15, 2) DEFAULT 0,
    other_income_amount NUMERIC(15, 2) DEFAULT 0,
    other_income_info TEXT,
    total_gross_salary NUMERIC(15, 2) DEFAULT 0,
    provident_fund NUMERIC(15, 2) DEFAULT 0,
    insurance_amount NUMERIC(15, 2) DEFAULT 0,
    professional_tax NUMERIC(15, 2) DEFAULT 0,
    loan_installment NUMERIC(15, 2) DEFAULT 0,
    savings_reduction NUMERIC(15, 2) DEFAULT 0,
    society_deduction NUMERIC(15, 2) DEFAULT 0,
    other_deduction_amount NUMERIC(15, 2) DEFAULT 0,
    other_deduction_info TEXT,
    total_deduction NUMERIC(15, 2) DEFAULT 0,
    net_salary NUMERIC(15, 2) DEFAULT 0,
    transfer_possibility BOOLEAN DEFAULT FALSE,
    transfer_replacement_place VARCHAR(255),
    has_pension_scheme BOOLEAN DEFAULT FALSE,
    total_provident_fund NUMERIC(15, 2) DEFAULT 0,
    will_deduct_installment BOOLEAN DEFAULT FALSE,
    is_borrowed BOOLEAN DEFAULT FALSE,
    borrowed_amount_to_pay NUMERIC(15, 2) DEFAULT 0,
    has_credit_society BOOLEAN DEFAULT FALSE,
    is_credit_society_member BOOLEAN DEFAULT FALSE,
    credit_society_investment_details TEXT,
    credit_society_loan_details TEXT,
    salary_payout_mode VARCHAR(50),
    salary_bank_name VARCHAR(255),
    salary_branch_name VARCHAR(255),
    salary_ifsc_code VARCHAR(20),
    org_address TEXT,
    org_landmark VARCHAR(255),
    org_state_id INT,
    org_district_id INT,
    org_taluka_id INT,
    org_village VARCHAR(100),
    org_pincode VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Business / Profession
CREATE TABLE IF NOT EXISTS proposal_income_business (
    id BIGINT PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) DEFAULT 'B',
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    category VARCHAR(50),
    firm_name VARCHAR(255),
    nature_of_business TEXT,
    license_owner_name VARCHAR(255),
    years_in_business INT,
    turnover_amount NUMERIC(15, 2) DEFAULT 0,
    net_profit_loss NUMERIC(15, 2) DEFAULT 0,
    contact_no VARCHAR(20),
    email_id VARCHAR(100),
    space_status VARCHAR(50),
    business_constitution VARCHAR(100),
    pan_number VARCHAR(20),
    has_required_laws BOOLEAN DEFAULT FALSE,
    ownership_type VARCHAR(100),
    is_msme_registered BOOLEAN DEFAULT FALSE,
    msme_registration_number VARCHAR(100),
    msme_registration_date DATE,
    has_dist_cert BOOLEAN DEFAULT FALSE,
    has_gst_cert BOOLEAN DEFAULT FALSE,
    gst_number VARCHAR(50),
    is_shop_act_licensed BOOLEAN DEFAULT FALSE,
    shop_act_number VARCHAR(100),
    is_shop_act_renewed BOOLEAN DEFAULT FALSE,
    business_remark TEXT,
    place_owner_name VARCHAR(255),
    has_rental_agreement BOOLEAN DEFAULT FALSE,
    lease_expiry_date DATE,
    business_address TEXT,
    address TEXT,
    landmark VARCHAR(255),
    state_id INT,
    district_id INT,
    taluka_id INT,
    village VARCHAR(100),
    pincode VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proposal_income_business_financials (
    id BIGINT PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES proposal_income_business(id) ON DELETE CASCADE,
    year_order SMALLINT NOT NULL,       -- 1, 2, or 3
    year_label VARCHAR(20),             -- e.g. '2022-23'
    sales NUMERIC(15,2) DEFAULT 0,
    purchases NUMERIC(15,2) DEFAULT 0,
    depreciation NUMERIC(15,2) DEFAULT 0,
    int_on_cc NUMERIC(15,2) DEFAULT 0,
    int_on_tl NUMERIC(15,2) DEFAULT 0,
    net_profit NUMERIC(15,2) DEFAULT 0,
    capital NUMERIC(15,2) DEFAULT 0,
    cash_credit_loan NUMERIC(15,2) DEFAULT 0,
    term_loan NUMERIC(15,2) DEFAULT 0,
    unsecured_loans NUMERIC(15,2) DEFAULT 0,
    creditors NUMERIC(15,2) DEFAULT 0,
    other_liabilities NUMERIC(15,2) DEFAULT 0,
    fixed_asset NUMERIC(15,2) DEFAULT 0,
    investments NUMERIC(15,2) DEFAULT 0,
    stock NUMERIC(15,2) DEFAULT 0,
    debtors NUMERIC(15,2) DEFAULT 0,
    cash_and_bank NUMERIC(15,2) DEFAULT 0,
    loans_and_advances NUMERIC(15,2) DEFAULT 0,
    other_asset NUMERIC(15,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS proposal_income_business_branches (
    id BIGINT PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES proposal_income_business(id) ON DELETE CASCADE,
    branch_name VARCHAR(255),
    address TEXT,
    landmark VARCHAR(255),
    state_id INT,
    district_id INT,
    taluka_id INT,
    village VARCHAR(100),
    pincode VARCHAR(10)
);

CREATE TABLE IF NOT EXISTS proposal_income_business_licenses (
    id BIGINT PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES proposal_income_business(id) ON DELETE CASCADE,
    license_name VARCHAR(255),
    license_number VARCHAR(100)
);

-- Agriculture
CREATE TABLE IF NOT EXISTS proposal_income_agriculture (
    id BIGINT PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) DEFAULT 'B',
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    land_owner_name VARCHAR(255),
    current_crops TEXT,
    annual_income NUMERIC(15, 2) DEFAULT 0,
    horticulture_hector NUMERIC(10, 4) DEFAULT 0,
    horticulture_aar NUMERIC(10, 4) DEFAULT 0,
    arable_hector NUMERIC(10, 4) DEFAULT 0,
    arable_aar NUMERIC(10, 4) DEFAULT 0,
    total_agri_hector NUMERIC(10, 4) DEFAULT 0,
    total_agri_aar NUMERIC(10, 4) DEFAULT 0,
    sugarcane_hector NUMERIC(10, 4) DEFAULT 0,
    sugarcane_aar NUMERIC(10, 4) DEFAULT 0,
    other_crop_hector NUMERIC(10, 4) DEFAULT 0,
    other_crop_aar NUMERIC(10, 4) DEFAULT 0,
    income_sugarcane NUMERIC(15, 2) DEFAULT 0,
    income_other NUMERIC(15, 2) DEFAULT 0,
    total_agri_income NUMERIC(15, 2) DEFAULT 0,
    address TEXT,
    group_no VARCHAR(100),
    state_id INT,
    district_id INT,
    taluka_id INT,
    village VARCHAR(100),
    pincode VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proposal_income_agri_sugarcane_bills (
    id BIGINT PRIMARY KEY,
    agri_id BIGINT NOT NULL REFERENCES proposal_income_agriculture(id) ON DELETE CASCADE,
    factory_name VARCHAR(255),
    dry_season VARCHAR(50),
    sugarcane_area VARCHAR(50),
    tonnage NUMERIC(10, 2) DEFAULT 0,
    bill_amount NUMERIC(15, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS proposal_income_agri_next_season (
    id BIGINT PRIMARY KEY,
    agri_id BIGINT NOT NULL REFERENCES proposal_income_agriculture(id) ON DELETE CASCADE,
    factory_name VARCHAR(255),
    dry_season VARCHAR(50),
    sugarcane_area VARCHAR(50)
);

-- House / Shop Rent
CREATE TABLE IF NOT EXISTS proposal_income_rent (
    id BIGINT PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) DEFAULT 'B',
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    rented_to_name VARCHAR(255),
    property_no VARCHAR(100),
    has_agreement BOOLEAN DEFAULT FALSE,
    agreement_term VARCHAR(100),
    lease_expiry_date DATE,
    monthly_rent_amount NUMERIC(15, 2) DEFAULT 0,
    gst_amount NUMERIC(15, 2) DEFAULT 0,
    tds_amount NUMERIC(15, 2) DEFAULT 0,
    net_rent_received NUMERIC(15, 2) DEFAULT 0,
    is_rent_discounting_scheme BOOLEAN DEFAULT FALSE,
    remark TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Milk Production
CREATE TABLE IF NOT EXISTS proposal_income_milk (
    id BIGINT PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) DEFAULT 'B',
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    remark TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proposal_income_milk_rows (
    id BIGINT PRIMARY KEY,
    milk_id BIGINT NOT NULL REFERENCES proposal_income_milk(id) ON DELETE CASCADE,
    duration_label VARCHAR(100),
    morning_litre NUMERIC(10, 2) DEFAULT 0,
    morning_rate NUMERIC(10, 2) DEFAULT 0,
    morning_amount NUMERIC(15, 2) DEFAULT 0,
    evening_litre NUMERIC(10, 2) DEFAULT 0,
    evening_rate NUMERIC(10, 2) DEFAULT 0,
    evening_amount NUMERIC(15, 2) DEFAULT 0
);

-- Other Income
CREATE TABLE IF NOT EXISTS proposal_income_other (
    id BIGINT PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) DEFAULT 'B',
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    source_name VARCHAR(255),
    source_type VARCHAR(100),
    years_active INT,
    annual_income NUMERIC(15, 2) DEFAULT 0,
    contact_no VARCHAR(20),
    landmark VARCHAR(255),
    state_id INT,
    district_id INT,
    taluka_id INT,
    village VARCHAR(100),
    pincode VARCHAR(10),
    address TEXT,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. DOCUMENT MANAGEMENT
-- Document Master
CREATE TABLE IF NOT EXISTS document_master (
    id SERIAL PRIMARY KEY,
    doc_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_mandatory BOOLEAN DEFAULT FALSE,
    entity_type CHAR(1) DEFAULT 'A', -- 'B': Borrower, 'G': Guarantor, 'C': Co-borrower, 'A': All
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Proposal Documents
CREATE TABLE IF NOT EXISTS proposal_documents (
    id SERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    document_master_id INT REFERENCES document_master(id) ON DELETE SET NULL,
    custom_doc_name VARCHAR(255), -- Used if document_master_id is NULL
    entity_type CHAR(1) NOT NULL, -- 'B', 'G', 'C'
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100),
    file_size BIGINT,
    
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
    verification_remarks TEXT,
    verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. SEED DATA
-- Special Roles
INSERT INTO roles (id, role_name, description) VALUES 
  (1, 'admin', 'System Administrator'),
  (2, 'bm', 'Branch Manager'),
  (3, 'ba', 'Branch Associate'),
  (4, 'loan_officer', 'Loan Officer')
ON CONFLICT (id) DO NOTHING;

-- Initial tabs
INSERT INTO tab_master (id, key, label, icon, sort_order) VALUES
(1, 'personal',        'Personal',            'pi pi-user',           2),
(2, 'loan',            'Loan Info',           'pi pi-money-bill',     3),
(3, 'income',          'Income Info',         'pi pi-briefcase',      4),
(4, 'financial',       'Financial Info',      'pi pi-dollar',         5),
(5, 'credit',          'Credit Info',         'pi pi-percentage',     6),
(6, 'property',        'Property Info',       'pi pi-home',           7),
(7, 'guarantor',       'Guarantor Info',      'pi pi-users',          8),
(8, 'coborrower',      'Coborrower Info',     'pi pi-user-plus',      9),
(9, 'bank_scheme',     'Bank Scheme MIS',     'pi pi-book',           10),
(10, 'loan_specific',   'Loan Specific Info',  'pi pi-info-circle',    11)
ON CONFLICT (key) DO UPDATE SET 
    label = EXCLUDED.label,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

-- Document Master Seed Data
INSERT INTO document_master (doc_name, entity_type, is_mandatory, sort_order) VALUES
('Aadhaar Card', 'A', TRUE, 1),
('PAN Card', 'A', TRUE, 2),
('Recent Photo', 'A', TRUE, 3),
('Salary Slip (Last 3 Months)', 'B', FALSE, 4),
('ITR / Form 16', 'B', FALSE, 5),
('Business License', 'B', FALSE, 6),
('Property Documents', 'B', FALSE, 7)
ON CONFLICT DO NOTHING;

-- 8. TRIGGERS
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN (
            'branches', 'roles', 'users', 'loan_types', 'proposals', 'tab_master', 'proposal_tab_mapping',
            'proposal_personal_info', 'proposal_loan_info', 'proposal_loan_participation', 'proposal_financial_info', 'proposal_property_info',
            'proposal_income_job', 'proposal_income_business', 'proposal_income_agriculture', 'proposal_income_rent', 
            'proposal_income_milk', 'proposal_income_other', 'proposal_credit_info', 'proposal_credit_loans_this_bank',
            'proposal_credit_loans_other_banks', 'proposal_credit_guarantees_this_bank',
            'proposal_credit_guarantees_other_banks', 'proposal_credit_loans_previous_this_bank',
            'proposal_credit_loans_previous_other_banks', 'proposal_credit_accounts_this_bank',
            'proposal_credit_accounts_other_banks', 'proposal_life_insurance', 'proposal_new_insurance', 'proposal_roc_debts',
            'document_master', 'proposal_documents'
          )
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_modtime ON %I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_modtime BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE update_modified_column()', t, t);
    END LOOP;
END $$;
