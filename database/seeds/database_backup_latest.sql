--
-- PostgreSQL database dump
--

\restrict AqrnbwSMqOBPMFeHFcMlVzRWD2csegD3qNQulL3vMMl5LUZ8re5CTEqwhjzbrXJ

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: assessment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.assessment_status AS ENUM (
    'draft',
    'submitted',
    'locked'
);


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendance_status AS ENUM (
    'present',
    'absent',
    'late',
    'excused'
);


--
-- Name: class_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.class_status AS ENUM (
    'planning',
    'open',
    'in_progress',
    'completed',
    'cancelled',
    'archived'
);


--
-- Name: competency_rating; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.competency_rating AS ENUM (
    'not_assessed',
    'needs_improvement',
    'competent',
    'good',
    'excellent'
);


--
-- Name: completion_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.completion_status AS ENUM (
    'pending',
    'eligible',
    'approved',
    'rejected'
);


--
-- Name: course_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.course_status AS ENUM (
    'draft',
    'active',
    'inactive',
    'archived'
);


--
-- Name: course_test_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.course_test_kind AS ENUM (
    'class_test',
    'final_exam'
);


--
-- Name: enrollment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enrollment_status AS ENUM (
    'enrolled',
    'transferred',
    'completed',
    'withdrawn'
);


--
-- Name: interaction_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.interaction_channel AS ENUM (
    'phone_call',
    'zalo',
    'facebook',
    'email',
    'in_person',
    'sms',
    'other'
);


--
-- Name: lead_pipeline_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_pipeline_status AS ENUM (
    'data_moi',
    'knm_thue_bao',
    'goi_lai_sau',
    'follow',
    'tu_choi',
    'da_dang_ky',
    'dang_hoc',
    'ket_thuc'
);


--
-- Name: lead_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_source AS ENUM (
    'facebook',
    'tiktok',
    'google',
    'zalo',
    'website',
    'referral',
    'walk_in',
    'event',
    'other'
);


--
-- Name: notification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_status AS ENUM (
    'unread',
    'read',
    'archived'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'paid',
    'cancelled',
    'refunded'
);


--
-- Name: session_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.session_status AS ENUM (
    'scheduled',
    'completed',
    'cancelled',
    'locked'
);


--
-- Name: session_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.session_type AS ENUM (
    'theory',
    'workshop',
    'assessment',
    'other'
);


--
-- Name: student_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.student_status AS ENUM (
    'pending',
    'active',
    'suspended',
    'completed',
    'withdrawn'
);


--
-- Name: teacher_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.teacher_status AS ENUM (
    'active',
    'inactive'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'pending',
    'active',
    'suspended',
    'inactive'
);


--
-- Name: create_initial_enrollment_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_initial_enrollment_period() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO class_enrollment_periods (
    enrollment_id, started_at, ended_at, created_by, start_reason
  ) VALUES (
    NEW.id, NEW.enrolled_at, NEW.ended_at, NEW.created_by, 'Ghi danh vào lớp'
  );
  RETURN NEW;
END;
$$;


--
-- Name: create_initial_teacher_assignment_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_initial_teacher_assignment_period() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO teacher_assignment_periods (
    assignment_id, started_at, created_by, start_reason
  ) VALUES (
    NEW.id, NEW.assigned_at, NEW.assigned_by, 'Phân công giảng viên'
  );
  RETURN NEW;
END;
$$;


--
-- Name: enforce_class_capacity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_class_capacity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_capacity INTEGER;
  v_enrolled_count INTEGER;
BEGIN
  IF NEW.status <> 'enrolled'::enrollment_status THEN
    RETURN NEW;
  END IF;

  SELECT maximum_students
  INTO v_capacity
  FROM classes
  WHERE id = NEW.class_id
  FOR UPDATE;

  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'Class % does not exist', NEW.class_id;
  END IF;

  SELECT COUNT(*)
  INTO v_enrolled_count
  FROM class_enrollments
  WHERE class_id = NEW.class_id
    AND status = 'enrolled'::enrollment_status
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF v_enrolled_count >= v_capacity THEN
    RAISE EXCEPTION 'Class % has reached its maximum capacity of % students', NEW.class_id, v_capacity;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: prevent_capacity_reduction_below_enrollment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_capacity_reduction_below_enrollment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_enrolled_count INTEGER;
BEGIN
  IF NEW.maximum_students = OLD.maximum_students THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO v_enrolled_count
  FROM class_enrollments
  WHERE class_id = NEW.id
    AND status = 'enrolled'::enrollment_status;

  IF NEW.maximum_students < v_enrolled_count THEN
    RAISE EXCEPTION 'Maximum students (%) cannot be lower than current enrollment (%)',
      NEW.maximum_students, v_enrolled_count;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: assessment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    course_id uuid NOT NULL,
    competency_criterion_id uuid NOT NULL,
    rating public.competency_rating DEFAULT 'not_assessed'::public.competency_rating NOT NULL,
    comment text,
    assessed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_session_id uuid NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status public.attendance_status NOT NULL,
    note text,
    recorded_by uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    actor_user_id uuid,
    action character varying(100) NOT NULL,
    entity_type character varying(80) NOT NULL,
    entity_id uuid,
    old_values jsonb,
    new_values jsonb,
    reason text,
    request_id uuid,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: certificate_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.certificate_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    completion_id uuid NOT NULL,
    certificate_number character varying(20) DEFAULT ('CC'::text || lpad((nextval('public.certificate_number_seq'::regclass))::text, 8, '0'::text)) NOT NULL,
    verification_code uuid DEFAULT gen_random_uuid() NOT NULL,
    issued_by uuid NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    revoke_reason character varying(1000),
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    diploma_file_url text,
    diploma_file_name character varying(255),
    diploma_uploaded_at timestamp with time zone,
    diploma_uploaded_by uuid,
    CONSTRAINT certificates_revocation_check CHECK (((is_current AND (revoked_at IS NULL) AND (revoked_by IS NULL) AND (revoke_reason IS NULL)) OR ((NOT is_current) AND (revoked_at IS NOT NULL) AND (revoked_by IS NOT NULL) AND (btrim((revoke_reason)::text) <> ''::text))))
);


--
-- Name: class_enrollment_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_enrollment_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    enrollment_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    created_by uuid,
    ended_by uuid,
    start_reason text,
    end_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_enrollment_periods_dates_check CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))
);


--
-- Name: class_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status public.enrollment_status DEFAULT 'enrolled'::public.enrollment_status NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_enrollments_ended_check CHECK (((ended_at IS NULL) OR (ended_at >= enrolled_at))),
    CONSTRAINT class_enrollments_status_date_check CHECK ((((status = 'enrolled'::public.enrollment_status) AND (ended_at IS NULL)) OR ((status <> 'enrolled'::public.enrollment_status) AND (ended_at IS NOT NULL))))
);


--
-- Name: class_operation_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_operation_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    event_type character varying(60) NOT NULL,
    entity_type character varying(40) NOT NULL,
    entity_id uuid,
    reason character varying(500),
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor_user_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_operation_history_entity_type_check CHECK ((btrim((entity_type)::text) <> ''::text)),
    CONSTRAINT class_operation_history_event_type_check CHECK ((btrim((event_type)::text) <> ''::text)),
    CONSTRAINT class_operation_history_reason_check CHECK (((reason IS NULL) OR (btrim((reason)::text) <> ''::text)))
);


--
-- Name: class_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    course_id uuid NOT NULL,
    module_id uuid,
    teacher_id uuid,
    location_id uuid,
    title character varying(200) NOT NULL,
    session_type public.session_type DEFAULT 'theory'::public.session_type NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    status public.session_status DEFAULT 'scheduled'::public.session_status NOT NULL,
    attendance_locked_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_sessions_lock_check CHECK (((attendance_locked_at IS NULL) OR (attendance_locked_at >= starts_at))),
    CONSTRAINT class_sessions_time_check CHECK ((ends_at > starts_at)),
    CONSTRAINT class_sessions_training_slot_check CHECK (((((starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date = ((ends_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date) AND (((((starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::time without time zone = '08:00:00'::time without time zone) AND (((ends_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::time without time zone = '12:00:00'::time without time zone)) OR ((((starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::time without time zone = '13:30:00'::time without time zone) AND (((ends_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::time without time zone = '17:30:00'::time without time zone)) OR ((((starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::time without time zone = '18:30:00'::time without time zone) AND (((ends_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::time without time zone = '21:30:00'::time without time zone)))))
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    class_code character varying(40) NOT NULL,
    name character varying(200) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    maximum_students integer NOT NULL,
    status public.class_status DEFAULT 'planning'::public.class_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT classes_capacity_check CHECK ((maximum_students > 0)),
    CONSTRAINT classes_dates_check CHECK ((end_date >= start_date))
);


--
-- Name: competency_criteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competency_criteria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    module_id uuid,
    code character varying(40) NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    is_required boolean DEFAULT true NOT NULL,
    sequence_no integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT competency_criteria_sequence_check CHECK ((sequence_no > 0))
);


--
-- Name: completion_decision_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.completion_decision_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    completion_id uuid NOT NULL,
    status public.completion_status NOT NULL,
    attendance_pct numeric(5,2) NOT NULL,
    required_competencies_met integer NOT NULL,
    required_competencies_total integer NOT NULL,
    note character varying(1000) NOT NULL,
    decided_by uuid NOT NULL,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    required_tests_passed integer DEFAULT 0 NOT NULL,
    required_tests_total integer DEFAULT 0 NOT NULL,
    final_exam_score numeric(4,2),
    CONSTRAINT completion_decision_history_note_check CHECK ((btrim((note)::text) <> ''::text)),
    CONSTRAINT completion_decision_history_status_check CHECK ((status = ANY (ARRAY['approved'::public.completion_status, 'rejected'::public.completion_status]))),
    CONSTRAINT completion_decision_history_test_metrics_check CHECK (((required_tests_passed >= 0) AND (required_tests_total >= 0) AND (required_tests_passed <= required_tests_total) AND ((final_exam_score IS NULL) OR ((final_exam_score >= (0)::numeric) AND (final_exam_score <= (10)::numeric)))))
);


--
-- Name: course_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    attendance_pct numeric(5,2) DEFAULT 0 NOT NULL,
    required_competencies_met integer DEFAULT 0 NOT NULL,
    required_competencies_total integer DEFAULT 0 NOT NULL,
    status public.completion_status DEFAULT 'pending'::public.completion_status NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    course_id uuid NOT NULL,
    required_tests_passed integer DEFAULT 0 NOT NULL,
    required_tests_total integer DEFAULT 0 NOT NULL,
    final_exam_score numeric(4,2),
    CONSTRAINT course_completions_attendance_check CHECK (((attendance_pct >= (0)::numeric) AND (attendance_pct <= (100)::numeric))),
    CONSTRAINT course_completions_competency_check CHECK (((required_competencies_met >= 0) AND (required_competencies_total >= 0) AND (required_competencies_met <= required_competencies_total))),
    CONSTRAINT course_completions_review_check CHECK ((((status = ANY (ARRAY['pending'::public.completion_status, 'eligible'::public.completion_status])) AND (reviewed_at IS NULL)) OR ((status = ANY (ARRAY['approved'::public.completion_status, 'rejected'::public.completion_status])) AND (reviewed_at IS NOT NULL) AND (reviewed_by IS NOT NULL)))),
    CONSTRAINT course_completions_test_metrics_check CHECK (((required_tests_passed >= 0) AND (required_tests_total >= 0) AND (required_tests_passed <= required_tests_total) AND ((final_exam_score IS NULL) OR ((final_exam_score >= (0)::numeric) AND (final_exam_score <= (10)::numeric)))))
);


--
-- Name: course_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    code character varying(30) NOT NULL,
    name character varying(200) NOT NULL,
    sequence_no integer NOT NULL,
    planned_sessions integer DEFAULT 1 NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT course_modules_sequence_check CHECK ((sequence_no > 0)),
    CONSTRAINT course_modules_sessions_check CHECK ((planned_sessions > 0))
);


--
-- Name: course_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    code character varying(40) NOT NULL,
    title character varying(200) NOT NULL,
    kind public.course_test_kind NOT NULL,
    pass_score numeric(4,2) DEFAULT 5 NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    sequence_no integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT course_tests_final_rule_check CHECK (((kind <> 'final_exam'::public.course_test_kind) OR ((pass_score = (5)::numeric) AND is_required))),
    CONSTRAINT course_tests_score_check CHECK (((pass_score >= (0)::numeric) AND (pass_score <= (10)::numeric))),
    CONSTRAINT course_tests_sequence_check CHECK ((sequence_no > 0))
);


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(30) NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    total_sessions integer NOT NULL,
    minimum_attendance_pct numeric(5,2) DEFAULT 80 NOT NULL,
    status public.course_status DEFAULT 'draft'::public.course_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT courses_attendance_check CHECK ((minimum_attendance_pct = (80)::numeric)),
    CONSTRAINT courses_total_sessions_check CHECK ((total_sessions > 0))
);


--
-- Name: goose_db_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goose_db_version (
    id integer NOT NULL,
    version_id bigint NOT NULL,
    is_applied boolean NOT NULL,
    tstamp timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: goose_db_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.goose_db_version ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.goose_db_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lead_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    channel public.interaction_channel NOT NULL,
    summary text NOT NULL,
    outcome text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_pipeline_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_pipeline_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    old_status public.lead_pipeline_status,
    new_status public.lead_pipeline_status NOT NULL,
    reason text,
    changed_by uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    assigned_to uuid NOT NULL,
    title character varying(300) NOT NULL,
    description text,
    due_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name character varying(200) NOT NULL,
    phone character varying(20),
    email public.citext,
    date_of_birth date,
    gender character varying(10),
    address text,
    source public.lead_source DEFAULT 'other'::public.lead_source NOT NULL,
    source_detail text,
    utm_source character varying(100),
    utm_medium character varying(100),
    utm_campaign character varying(200),
    utm_content character varying(200),
    utm_term character varying(200),
    interested_course_id uuid,
    notes text,
    pipeline_status public.lead_pipeline_status DEFAULT 'data_moi'::public.lead_pipeline_status NOT NULL,
    assigned_to uuid,
    assigned_at timestamp with time zone,
    assigned_by uuid,
    converted_student_id uuid,
    converted_at timestamp with time zone,
    converted_by uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    type character varying(60) DEFAULT 'general'::character varying NOT NULL,
    status public.notification_status DEFAULT 'unread'::public.notification_status NOT NULL,
    action_url text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_read_check CHECK (((status <> 'read'::public.notification_status) OR (read_at IS NOT NULL)))
);


--
-- Name: order_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_code character varying(20) DEFAULT ('DH'::text || lpad((nextval('public.order_code_seq'::regclass))::text, 8, '0'::text)) NOT NULL,
    lead_id uuid,
    student_id uuid,
    course_id uuid,
    class_id uuid,
    amount numeric(12,0) DEFAULT 0 NOT NULL,
    discount_amount numeric(12,0) DEFAULT 0 NOT NULL,
    final_amount numeric(12,0) DEFAULT 0 NOT NULL,
    discount_note text,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    payment_method character varying(50),
    paid_at timestamp with time zone,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_ip inet,
    user_agent text,
    CONSTRAINT refresh_tokens_expiry_check CHECK ((expires_at > created_at)),
    CONSTRAINT refresh_tokens_revoked_check CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at)))
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id smallint NOT NULL,
    code character varying(40) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: student_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    course_id uuid NOT NULL,
    student_id uuid NOT NULL,
    assessed_by uuid NOT NULL,
    session_id uuid,
    assessment_no integer DEFAULT 1 NOT NULL,
    status public.assessment_status DEFAULT 'draft'::public.assessment_status NOT NULL,
    overall_comment text,
    submitted_at timestamp with time zone,
    locked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    evidence_url text,
    CONSTRAINT student_assessments_evidence_url_check CHECK (((evidence_url IS NULL) OR (evidence_url ~ '^https?://'::text))),
    CONSTRAINT student_assessments_number_check CHECK ((assessment_no > 0)),
    CONSTRAINT student_assessments_status_check CHECK ((((status = 'draft'::public.assessment_status) AND (submitted_at IS NULL) AND (locked_at IS NULL)) OR ((status = 'submitted'::public.assessment_status) AND (submitted_at IS NOT NULL) AND (locked_at IS NULL)) OR ((status = 'locked'::public.assessment_status) AND (submitted_at IS NOT NULL) AND (locked_at IS NOT NULL)))),
    CONSTRAINT student_assessments_timestamp_check CHECK ((((submitted_at IS NULL) OR (submitted_at >= created_at)) AND ((locked_at IS NULL) OR (locked_at >= submitted_at))))
);


--
-- Name: student_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    student_code character varying(30) DEFAULT ('HV'::text || lpad((nextval('public.student_code_seq'::regclass))::text, 8, '0'::text)) NOT NULL,
    full_name character varying(160) NOT NULL,
    phone character varying(30),
    date_of_birth date,
    status public.student_status DEFAULT 'pending'::public.student_status NOT NULL,
    enrolled_at date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gender character varying(20),
    address character varying(500),
    emergency_contact_name character varying(160),
    emergency_contact_phone character varying(30),
    avatar_url text,
    CONSTRAINT student_profiles_gender_check CHECK (((gender IS NULL) OR ((gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'other'::character varying, 'unspecified'::character varying])::text[]))))
);


--
-- Name: student_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    from_status public.student_status,
    to_status public.student_status NOT NULL,
    reason character varying(500) NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_status_history_transition_check CHECK (((from_status IS NULL) OR (from_status <> to_status)))
);


--
-- Name: student_test_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_test_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    course_id uuid NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    attempt_no integer NOT NULL,
    score numeric(4,2) NOT NULL,
    note character varying(1000),
    recorded_by uuid NOT NULL,
    taken_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_test_attempts_attempt_check CHECK ((attempt_no > 0)),
    CONSTRAINT student_test_attempts_score_check CHECK (((score >= (0)::numeric) AND (score <= (10)::numeric)))
);


--
-- Name: student_test_retake_permits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_test_retake_permits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    course_id uuid NOT NULL,
    student_id uuid NOT NULL,
    target_attempt_no integer NOT NULL,
    granted_by uuid NOT NULL,
    reason character varying(1000) NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT retake_permits_attempt_check CHECK ((target_attempt_no >= 2)),
    CONSTRAINT retake_permits_reason_check CHECK ((btrim((reason)::text) <> ''::text))
);


--
-- Name: teacher_assignment_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_assignment_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    created_by uuid,
    ended_by uuid,
    start_reason text,
    end_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT teacher_assignment_periods_dates_check CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))
);


--
-- Name: teacher_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    assignment_role character varying(80) DEFAULT 'Instructor'::character varying NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: teacher_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    teacher_code character varying(30) NOT NULL,
    full_name character varying(160) NOT NULL,
    phone character varying(30),
    specialization character varying(200),
    status public.teacher_status DEFAULT 'active'::public.teacher_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_url text
);


--
-- Name: test_attempt_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_attempt_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid NOT NULL,
    old_score numeric(4,2) NOT NULL,
    new_score numeric(4,2) NOT NULL,
    old_note character varying(1000),
    new_note character varying(1000),
    reason character varying(1000) NOT NULL,
    changed_by uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT test_attempt_history_reason_check CHECK ((btrim((reason)::text) <> ''::text))
);


--
-- Name: training_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(30) NOT NULL,
    name character varying(160) NOT NULL,
    location_type character varying(40) NOT NULL,
    capacity integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT training_locations_capacity_check CHECK (((capacity IS NULL) OR (capacity > 0)))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id smallint NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    password_hash text NOT NULL,
    status public.user_status DEFAULT 'pending'::public.user_status NOT NULL,
    must_change_password boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    full_name character varying(255),
    phone character varying(50),
    is_accepting_leads boolean DEFAULT true NOT NULL,
    lead_assignment_order integer DEFAULT 0 NOT NULL
);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Data for Name: assessment_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assessment_items (id, assessment_id, course_id, competency_criterion_id, rating, comment, assessed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: attendance_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attendance_records (id, class_session_id, class_id, student_id, status, note, recorded_by, recorded_at, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, actor_user_id, action, entity_type, entity_id, old_values, new_values, reason, request_id, ip_address, user_agent, created_at) FROM stdin;
1	11111111-1111-1111-1111-111111111111	test.action	course_test	20000000-0000-0000-0000-000000000001	\N	{"hello": "world"}	test	\N	\N	\N	2026-08-20 06:30:51.703929+00
2	11111111-1111-1111-1111-111111111111	test.action	course_test	20000000-0000-0000-0000-000000000001	\N	{"hello": "world"}	test	\N	\N	\N	2026-08-20 06:30:52.097495+00
3	11111111-1111-1111-1111-111111111111	course_test.create	course_test	41b3d3f1-7133-4528-8a5b-3c67b66778dc	\N	{"id": "41b3d3f1-7133-4528-8a5b-3c67b66778dc", "code": "KT01", "kind": "class_test", "title": "Kiểm tra lý thuyết 2", "course_id": "20000000-0000-0000-0000-000000000001", "is_active": true, "pass_score": 5, "is_required": true, "sequence_no": 1}	\N	\N	\N	\N	2026-08-20 06:31:19.961156+00
4	11111111-1111-1111-1111-111111111111	course_test.create	course_test	a7760339-074d-4168-8bc3-8bbb5262cbf4	\N	{"id": "a7760339-074d-4168-8bc3-8bbb5262cbf4", "code": "KT02", "kind": "class_test", "title": "Kiểm tra thực hành 2", "course_id": "20000000-0000-0000-0000-000000000001", "is_active": true, "pass_score": 5, "is_required": true, "sequence_no": 2}	\N	\N	\N	\N	2026-08-20 06:33:02.170838+00
5	22222222-2222-2222-2222-222222222222	test_attempt.create	student_test_attempt	77657fba-a0d1-445c-a8af-f755a5bfaef2	\N	{"id": "77657fba-a0d1-445c-a8af-f755a5bfaef2", "kind": "class_test", "note": null, "score": 8, "passed": true, "test_id": "41b3d3f1-7133-4528-8a5b-3c67b66778dc", "class_id": "30000000-0000-0000-0000-000000000001", "taken_at": "2026-08-20T06:41:40.703781Z", "test_code": "KT01", "attempt_no": 1, "class_code": "K24-ELEC-A", "pass_score": 5, "test_title": "Kiểm tra lý thuyết 2", "is_required": true, "recorded_by_email": "22222222-2222-2222-2222-222222222222"}	\N	\N	\N	\N	2026-08-20 06:41:38.904596+00
6	22222222-2222-2222-2222-222222222222	test_attempt.correct	student_test_attempt	77657fba-a0d1-445c-a8af-f755a5bfaef2	{"note": null, "score": 8}	{"id": "77657fba-a0d1-445c-a8af-f755a5bfaef2", "kind": "class_test", "note": null, "score": 9, "passed": true, "test_id": "41b3d3f1-7133-4528-8a5b-3c67b66778dc", "class_id": "30000000-0000-0000-0000-000000000001", "taken_at": "2026-08-20T06:41:40.703781Z", "test_code": "KT01", "attempt_no": 1, "class_code": "", "pass_score": 5, "test_title": "Kiểm tra lý thuyết 2", "is_required": false, "recorded_by_email": ""}	sai sot	\N	\N	\N	2026-08-20 06:42:10.784119+00
7	22222222-2222-2222-2222-222222222222	test_attempt.correct	student_test_attempt	77657fba-a0d1-445c-a8af-f755a5bfaef2	{"note": null, "score": 9}	{"id": "77657fba-a0d1-445c-a8af-f755a5bfaef2", "kind": "class_test", "note": null, "score": 8, "passed": true, "test_id": "41b3d3f1-7133-4528-8a5b-3c67b66778dc", "class_id": "30000000-0000-0000-0000-000000000001", "taken_at": "2026-08-20T06:41:40.703781Z", "test_code": "KT01", "attempt_no": 1, "class_code": "", "pass_score": 5, "test_title": "Kiểm tra lý thuyết 2", "is_required": false, "recorded_by_email": ""}	sai	\N	\N	\N	2026-08-20 06:42:26.136869+00
8	22222222-2222-2222-2222-222222222222	test_attempt.correct	student_test_attempt	77657fba-a0d1-445c-a8af-f755a5bfaef2	{"note": null, "score": 8}	{"id": "77657fba-a0d1-445c-a8af-f755a5bfaef2", "kind": "class_test", "note": null, "score": 7.5, "passed": true, "test_id": "41b3d3f1-7133-4528-8a5b-3c67b66778dc", "class_id": "30000000-0000-0000-0000-000000000001", "taken_at": "2026-08-20T06:41:40.703781Z", "test_code": "KT01", "attempt_no": 1, "class_code": "", "pass_score": 5, "test_title": "Kiểm tra lý thuyết 2", "is_required": false, "recorded_by_email": ""}	phuc khao	\N	\N	\N	2026-08-20 06:46:18.001384+00
9	11111111-1111-1111-1111-111111111111	attendance.correct	attendance_record	15f607db-1679-4fa0-b2fd-3a6c8f40a16a	{"id": "15f607db-1679-4fa0-b2fd-3a6c8f40a16a", "note": "Có đơn xin phép bận việc đột xuất", "status": "excused", "class_id": "30000000-0000-0000-0000-000000000001", "full_name": "Lê Hoàng Long", "student_id": "98a56a05-dbf9-477b-a3d4-7d200140f1db", "updated_at": "2026-08-19T07:42:12.719914Z", "recorded_at": "2026-08-19T07:42:12.719914Z", "recorded_by": "22222222-2222-2222-2222-222222222222", "student_code": "HV00000015", "class_session_id": "40000000-0000-0000-0000-000000000001"}	{"id": "15f607db-1679-4fa0-b2fd-3a6c8f40a16a", "note": "Có đơn xin phép bận việc đột xuất", "status": "present", "class_id": "30000000-0000-0000-0000-000000000001", "full_name": "Lê Hoàng Long", "student_id": "98a56a05-dbf9-477b-a3d4-7d200140f1db", "updated_at": "2026-08-20T07:34:33.042517Z", "recorded_at": "2026-08-19T07:42:12.719914Z", "recorded_by": "22222222-2222-2222-2222-222222222222", "student_code": "HV00000015", "class_session_id": "40000000-0000-0000-0000-000000000001"}	Có đơn xin phép bận việc đột xuất	\N	\N	\N	2026-08-20 07:34:33.042517+00
10	11111111-1111-1111-1111-111111111111	attendance.correct	attendance_record	965263ec-8def-4ec4-9872-ee72b495bfd1	{"id": "965263ec-8def-4ec4-9872-ee72b495bfd1", "note": "Tự động ghi vắng khi hết ngày điểm danh", "status": "absent", "class_id": "30000000-0000-0000-0000-000000000001", "full_name": "Nguyễn Thành Nam", "student_id": "fc4b6416-ee74-492e-a13f-1897064a779a", "updated_at": "2026-08-19T17:00:32.785377Z", "recorded_at": "2026-08-19T17:00:32.785377Z", "recorded_by": "22222222-2222-2222-2222-222222222222", "student_code": "HV00000014", "class_session_id": "40000000-0000-0000-0000-000000000002"}	{"id": "965263ec-8def-4ec4-9872-ee72b495bfd1", "note": "Tự động ghi vắng khi hết ngày điểm danh", "status": "present", "class_id": "30000000-0000-0000-0000-000000000001", "full_name": "Nguyễn Thành Nam", "student_id": "fc4b6416-ee74-492e-a13f-1897064a779a", "updated_at": "2026-08-20T09:13:32.846507Z", "recorded_at": "2026-08-19T17:00:32.785377Z", "recorded_by": "22222222-2222-2222-2222-222222222222", "student_code": "HV00000014", "class_session_id": "40000000-0000-0000-0000-000000000002"}	Có đi học	\N	\N	\N	2026-08-20 09:13:32.846507+00
11	44444444-4444-4444-4444-444444444445	lead_task.complete	lead_task	f8b055fd-76a0-4fe5-9241-5c49907f9252	{"id": "f8b055fd-76a0-4fe5-9241-5c49907f9252", "title": "Hẹn gọi lại sau 17h chiều", "due_at": "2026-10-07T00:55:42Z", "lead_id": "55555555-5555-5555-5555-555555555553", "lead_name": "Lê Hoàng Long", "created_at": "2026-10-07T03:55:42Z", "created_by": "44444444-4444-4444-4444-444444444444", "lead_phone": "0903332211", "updated_at": "2026-10-07T04:20:35Z", "assigned_to": "44444444-4444-4444-4444-444444444445", "description": "Khách đang bận họp, hẹn chiều liên hệ lại", "completed_at": null, "created_by_email": "sale@nsa.local", "assigned_to_email": "sale2@nsa.local"}	{"id": "f8b055fd-76a0-4fe5-9241-5c49907f9252", "title": "Hẹn gọi lại sau 17h chiều", "due_at": "2026-10-07T00:55:42Z", "lead_id": "55555555-5555-5555-5555-555555555553", "lead_name": "Lê Hoàng Long", "created_at": "2026-10-07T03:55:42Z", "created_by": "44444444-4444-4444-4444-444444444444", "lead_phone": "0903332211", "updated_at": "2026-10-07T04:27:34Z", "assigned_to": "44444444-4444-4444-4444-444444444445", "description": "Khách đang bận họp, hẹn chiều liên hệ lại", "completed_at": "2026-10-07T04:27:34Z", "created_by_email": "sale@nsa.local", "assigned_to_email": "sale2@nsa.local"}	\N	\N	\N	\N	2026-10-07 04:27:34.235436+00
54	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444"]}	\N	\N	\N	\N	2026-10-16 07:42:45.342254+00
55	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:42:46.026183+00
56	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:42:46.842718+00
12	44444444-4444-4444-4444-444444444446	lead.update_status	lead	55555555-5555-5555-5555-555555555515	{"id": "55555555-5555-5555-5555-555555555515", "email": "kiet.vv@gmail.com", "notes": null, "phone": "0906778899", "gender": "Nam", "source": "facebook", "address": "Quận Nam Từ Liêm, Hà Nội", "utm_term": null, "full_name": "Võ Văn Kiệt", "created_at": "2026-10-06T23:07:09Z", "created_by": "44444444-4444-4444-4444-444444444446", "updated_at": "2026-10-07T05:07:09Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T00:07:09Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444446", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "2001-03-15", "source_detail": "Fanpage NSA post xe Hybrid", "pipeline_status": "data_moi", "created_by_email": "sale3@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale3@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000003", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-EV-HYBRID", "interested_course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)"}	{"id": "55555555-5555-5555-5555-555555555515", "email": "kiet.vv@gmail.com", "notes": null, "phone": "0906778899", "gender": "Nam", "source": "facebook", "address": "Quận Nam Từ Liêm, Hà Nội", "utm_term": null, "full_name": "Võ Văn Kiệt", "created_at": "2026-10-06T23:07:09Z", "created_by": "44444444-4444-4444-4444-444444444446", "updated_at": "2026-10-07T06:20:43Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T00:07:09Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444446", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "2001-03-15", "source_detail": "Fanpage NSA post xe Hybrid", "pipeline_status": "tu_choi", "created_by_email": "sale3@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale3@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000003", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-EV-HYBRID", "interested_course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)"}	\N	\N	\N	\N	2026-10-07 06:20:43.840521+00
13	11111111-1111-1111-1111-111111111111	lead.convert	lead	55555555-5555-5555-5555-555555555503	\N	{"class_id": "30000000-0000-0000-0000-000000000003", "order_id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "student_code": "HV00000018"}	\N	\N	\N	\N	2026-10-07 08:42:49.566173+00
14	44444444-4444-4444-4444-444444444446	order.update_status	order	476a031a-d783-4c97-bceb-eabb6e4d68b5	{"id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "notes": "Th? nghi?m chuy?n d?i h?c vi�n", "amount": 15000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": null, "class_id": "30000000-0000-0000-0000-000000000003", "course_id": "20000000-0000-0000-0000-000000000003", "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-07T08:42:49Z", "created_by": "11111111-1111-1111-1111-111111111111", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-07T08:42:49Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "final_amount": 15000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "admin@nsa.local"}	{"id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "notes": "Th? nghi?m chuy?n d?i h?c vi�n", "amount": 15000000, "status": "paid", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": "2026-10-07T08:49:32Z", "class_id": "30000000-0000-0000-0000-000000000003", "course_id": "20000000-0000-0000-0000-000000000003", "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-07T08:42:49Z", "created_by": "11111111-1111-1111-1111-111111111111", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-07T08:49:31Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "final_amount": 15000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "admin@nsa.local"}	\N	\N	\N	\N	2026-10-07 08:49:31.059569+00
15	44444444-4444-4444-4444-444444444446	order.update_status	order	476a031a-d783-4c97-bceb-eabb6e4d68b5	{"id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "notes": "Th? nghi?m chuy?n d?i h?c vi�n", "amount": 15000000, "status": "paid", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": "2026-10-07T08:49:32Z", "class_id": "30000000-0000-0000-0000-000000000003", "course_id": "20000000-0000-0000-0000-000000000003", "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-07T08:42:49Z", "created_by": "11111111-1111-1111-1111-111111111111", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-07T08:49:31Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "final_amount": 15000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "admin@nsa.local"}	{"id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "notes": "Th? nghi?m chuy?n d?i h?c vi�n", "amount": 15000000, "status": "cancelled", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": "2026-10-07T08:49:32Z", "class_id": "30000000-0000-0000-0000-000000000003", "course_id": "20000000-0000-0000-0000-000000000003", "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-07T08:42:49Z", "created_by": "11111111-1111-1111-1111-111111111111", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-07T08:49:42Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "final_amount": 15000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "admin@nsa.local"}	\N	\N	\N	\N	2026-10-07 08:49:42.46412+00
16	44444444-4444-4444-4444-444444444446	order.update_status	order	476a031a-d783-4c97-bceb-eabb6e4d68b5	{"id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "notes": "Th? nghi?m chuy?n d?i h?c vi�n", "amount": 15000000, "status": "cancelled", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": "2026-10-07T08:49:32Z", "class_id": "30000000-0000-0000-0000-000000000003", "course_id": "20000000-0000-0000-0000-000000000003", "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-07T08:42:49Z", "created_by": "11111111-1111-1111-1111-111111111111", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-07T08:49:42Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "final_amount": 15000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "admin@nsa.local"}	{"id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "notes": "Th? nghi?m chuy?n d?i h?c vi�n", "amount": 15000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": "2026-10-07T08:49:32Z", "class_id": "30000000-0000-0000-0000-000000000003", "course_id": "20000000-0000-0000-0000-000000000003", "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-07T08:42:49Z", "created_by": "11111111-1111-1111-1111-111111111111", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-07T08:49:43Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "final_amount": 15000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "admin@nsa.local"}	\N	\N	\N	\N	2026-10-07 08:49:43.030652+00
57	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:42:47.947512+00
17	44444444-4444-4444-4444-444444444445	order.update_status	order	476a031a-d783-4c97-bceb-eabb6e4d68b5	{"id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "notes": "Th? nghi?m chuy?n d?i h?c vi�n", "amount": 15000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": "2026-10-07T08:49:32Z", "class_id": "30000000-0000-0000-0000-000000000003", "course_id": "20000000-0000-0000-0000-000000000003", "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-07T08:42:49Z", "created_by": "11111111-1111-1111-1111-111111111111", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-07T08:49:43Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "final_amount": 15000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "admin@nsa.local"}	{"id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "notes": "Th? nghi?m chuy?n d?i h?c vi�n", "amount": 15000000, "status": "paid", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": "2026-10-07T08:53:02Z", "class_id": "30000000-0000-0000-0000-000000000003", "course_id": "20000000-0000-0000-0000-000000000003", "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-07T08:42:49Z", "created_by": "11111111-1111-1111-1111-111111111111", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-07T08:53:01Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "final_amount": 15000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "admin@nsa.local"}	\N	\N	\N	\N	2026-10-07 08:53:01.310559+00
18	44444444-4444-4444-4444-444444444440	lead.create	lead	31420e2d-cfd1-4fb7-b5eb-e8070c7fcb3c	\N	{"id": "31420e2d-cfd1-4fb7-b5eb-e8070c7fcb3c", "email": "minh.tran99@example.com", "notes": "Quan tâm xe điện", "phone": "0909111222", "gender": "male", "source": "facebook", "address": "Hà Nội", "utm_term": null, "full_name": "Trần Văn Minh", "created_at": "2026-10-07T09:11:18Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:11:18Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T09:11:20Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444444", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1999-01-01", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000003", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-EV-HYBRID", "interested_course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)"}	\N	\N	\N	\N	2026-10-07 09:11:18.938871+00
19	44444444-4444-4444-4444-444444444440	lead.create	lead	def9b747-a6ba-44fa-80f4-480beb45a026	\N	{"id": "def9b747-a6ba-44fa-80f4-480beb45a026", "email": "hoa.le88@example.com", "notes": "Cần học tối", "phone": "0909333444", "gender": "female", "source": "tiktok", "address": "TP.HCM", "utm_term": null, "full_name": "Lê Thị Hoa", "created_at": "2026-10-07T09:11:19Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:11:19Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T09:11:20Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444445", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1988-05-12", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale2@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000001", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ELEC-PRO", "interested_course_name": "Kỹ thuật Điện & Điện tử Ô tô Nâng cao"}	\N	\N	\N	\N	2026-10-07 09:11:19.521322+00
20	44444444-4444-4444-4444-444444444440	lead.create	lead	bfa3f020-816c-4012-979c-7a34cd71b2e1	\N	{"id": "bfa3f020-816c-4012-979c-7a34cd71b2e1", "email": "ok.lead@example.com", "notes": "Đúng nè", "phone": "0909555666", "gender": "male", "source": "zalo", "address": "Đà Nẵng", "utm_term": null, "full_name": "Nguyễn Thành Công", "created_at": "2026-10-07T09:11:34Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:11:34Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T09:11:36Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444444", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "2000-12-20", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000003", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-EV-HYBRID", "interested_course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)"}	\N	\N	\N	\N	2026-10-07 09:11:34.773585+00
21	44444444-4444-4444-4444-444444444440	lead.create	lead	9b81cb72-658c-4bc9-877f-cc2d551b7958	\N	{"id": "9b81cb72-658c-4bc9-877f-cc2d551b7958", "email": "quocdat.pham@example.com", "notes": "Khách cần tư vấn gấp học phí", "phone": "0911888999", "gender": "male", "source": "facebook", "address": "Hà Nội", "utm_term": null, "full_name": "Phạm Quốc Đạt", "created_at": "2026-10-07T09:17:35Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:17:35Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T09:17:36Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444444", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1997-08-15", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000003", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-EV-HYBRID", "interested_course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)"}	\N	\N	\N	\N	2026-10-07 09:17:35.451015+00
22	44444444-4444-4444-4444-444444444440	lead.create	lead	810d8f15-7012-4574-b06c-96f6b0b689eb	\N	{"id": "810d8f15-7012-4574-b06c-96f6b0b689eb", "email": "thutrang.hoang@example.com", "notes": "Đăng ký ca tối", "phone": "0933444555", "gender": "female", "source": "tiktok", "address": "Đà Nẵng", "utm_term": null, "full_name": "Hoàng Thu Trang", "created_at": "2026-10-07T09:17:36Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:17:36Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T09:17:37Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444445", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "2000-11-22", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale2@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000002", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ENG-EFI", "interested_course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi"}	\N	\N	\N	\N	2026-10-07 09:17:36.074928+00
23	44444444-4444-4444-4444-444444444440	lead.create	lead	ad75f028-42bb-4019-87fb-fab9b7334758	\N	{"id": "ad75f028-42bb-4019-87fb-fab9b7334758", "email": "tranvanan@example.com", "notes": "Quan tâm khóa kỹ thuật xe điện & Hybrid", "phone": "0901234567", "gender": "male", "source": "facebook", "address": "Hà Nội", "utm_term": null, "full_name": "Trần Văn An", "created_at": "2026-10-07T09:40:51Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:40:51Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T09:40:52Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444444", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1998-05-15", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000003", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-EV-HYBRID", "interested_course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)"}	\N	\N	\N	\N	2026-10-07 09:40:51.634288+00
24	44444444-4444-4444-4444-444444444440	lead.create	lead	e469c866-05c3-44c4-bf9b-79b8685bd66c	\N	{"id": "e469c866-05c3-44c4-bf9b-79b8685bd66c", "email": "mainguyen@example.com", "notes": "Tư vấn lịch học thực hành buổi tối", "phone": "0912345678", "gender": "female", "source": "tiktok", "address": "TP. Hồ Chí Minh", "utm_term": null, "full_name": "Nguyễn Thị Mai", "created_at": "2026-10-07T09:40:52Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:40:52Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T09:40:53Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444445", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "2001-10-20", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale2@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000001", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ELEC-PRO", "interested_course_name": "Kỹ thuật Điện & Điện tử Ô tô Nâng cao"}	\N	\N	\N	\N	2026-10-07 09:40:52.280338+00
25	44444444-4444-4444-4444-444444444440	lead.create	lead	e175ff64-3196-4902-90a0-6e888c9a1adf	\N	{"id": "e175ff64-3196-4902-90a0-6e888c9a1adf", "email": "huy.le@example.com", "notes": "Muốn bổ túc chẩn đoán động cơ GDI", "phone": "0987654321", "gender": "male", "source": "zalo", "address": "Đà Nẵng", "utm_term": null, "full_name": "Lê Quốc Huy", "created_at": "2026-10-07T09:40:52Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:40:52Z", "utm_medium": null, "utm_source": null, "assigned_at": null, "assigned_by": null, "assigned_to": null, "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1995-12-08", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": null, "assigned_to_email": null, "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000002", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ENG-EFI", "interested_course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi"}	\N	\N	\N	\N	2026-10-07 09:40:52.913897+00
26	44444444-4444-4444-4444-444444444440	lead.create	lead	60a1f641-4078-49ec-80f2-c719e353faf5	\N	{"id": "60a1f641-4078-49ec-80f2-c719e353faf5", "email": "tranvanan@example.com", "notes": "Quan tâm khóa kỹ thuật xe điện & Hybrid", "phone": "901234888", "gender": "male", "source": "facebook", "address": "Hà Nội", "utm_term": null, "full_name": "Trần Văn Băng", "created_at": "2026-10-07T09:45:11Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:45:11Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T09:45:13Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444444", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1998-05-15", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000003", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-EV-HYBRID", "interested_course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)"}	\N	\N	\N	\N	2026-10-07 09:45:11.949505+00
27	44444444-4444-4444-4444-444444444440	lead.create	lead	29f90334-81ed-4a1c-823b-7f4bda771b1b	\N	{"id": "29f90334-81ed-4a1c-823b-7f4bda771b1b", "email": "mainguyen@example.com", "notes": "Tư vấn lịch học thực hành buổi tối", "phone": "0912345999", "gender": "female", "source": "tiktok", "address": "TP. Hồ Chí Minh", "utm_term": null, "full_name": "Nguyễn Thị Hồng", "created_at": "2026-10-07T09:45:12Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:45:12Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-07T09:45:13Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444445", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "2001-10-20", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale2@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000001", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ELEC-PRO", "interested_course_name": "Kỹ thuật Điện & Điện tử Ô tô Nâng cao"}	\N	\N	\N	\N	2026-10-07 09:45:12.532909+00
28	44444444-4444-4444-4444-444444444440	lead.create	lead	e755645d-f430-4fa4-9446-9bad6550fcf5	\N	{"id": "e755645d-f430-4fa4-9446-9bad6550fcf5", "email": "huy.le@example.com", "notes": "Muốn bổ túc chẩn đoán động cơ GDI", "phone": "0987654777", "gender": "male", "source": "zalo", "address": "Đà Nẵng", "utm_term": null, "full_name": "Lê Quốc Khanh", "created_at": "2026-10-07T09:45:13Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:45:13Z", "utm_medium": null, "utm_source": null, "assigned_at": null, "assigned_by": null, "assigned_to": null, "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1995-12-08", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": null, "assigned_to_email": null, "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000002", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ENG-EFI", "interested_course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi"}	\N	\N	\N	\N	2026-10-07 09:45:13.10752+00
58	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:42:49.060477+00
59	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444445	{"is_accepting_leads": true, "lead_assignment_order": 1}	{"is_accepting_leads": false}	\N	\N	\N	\N	2026-10-16 07:43:06.617597+00
29	11111111-1111-1111-1111-111111111111	order.update_status	order	476a031a-d783-4c97-bceb-eabb6e4d68b5	{"id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "notes": "Th? nghi?m chuy?n d?i h?c vi�n", "amount": 15000000, "status": "paid", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": "2026-10-07T08:53:02Z", "class_id": "30000000-0000-0000-0000-000000000003", "course_id": "20000000-0000-0000-0000-000000000003", "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-07T08:42:49Z", "created_by": "11111111-1111-1111-1111-111111111111", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-07T08:53:01Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "final_amount": 15000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "admin@nsa.local"}	{"id": "476a031a-d783-4c97-bceb-eabb6e4d68b5", "notes": "Th? nghi?m chuy?n d?i h?c vi�n", "amount": 15000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": "2026-10-07T08:53:02Z", "class_id": "30000000-0000-0000-0000-000000000003", "course_id": "20000000-0000-0000-0000-000000000003", "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-07T08:42:49Z", "created_by": "11111111-1111-1111-1111-111111111111", "order_code": "DH00000009", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-08T06:35:25Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "final_amount": 15000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "admin@nsa.local"}	\N	\N	\N	\N	2026-10-08 06:35:25.976117+00
30	11111111-1111-1111-1111-111111111111	user.create	user	7a2ef762-dfb2-4285-9757-ce0d1d2d629a	\N	{"role": "ADMIN", "email": "trungnm@newcitygroupsuleco.com.vn", "phone": "", "status": "active", "full_name": "Nguyễn Minh Trung", "student_code": "", "teacher_code": ""}	\N	\N	\N	\N	2026-10-09 08:55:45.076766+00
31	7a2ef762-dfb2-4285-9757-ce0d1d2d629a	user.create	user	f1ac1788-2372-478b-897b-6ee076064fcb	\N	{"role": "ACADEMIC_ADMIN", "email": "newcitygroupsulecoit@gmail.com", "phone": "", "status": "active", "full_name": "IT mail", "student_code": "", "teacher_code": ""}	\N	\N	\N	\N	2026-10-10 02:19:43.764852+00
32	44444444-4444-4444-4444-444444444440	user.update_status	user	44444444-4444-4444-4444-444444444445	{"status": "active"}	{"status": "suspended"}	tạm nghỉ 1 ngày	\N	\N	\N	2026-10-16 07:05:58.011838+00
33	44444444-4444-4444-4444-444444444440	user.update_status	user	44444444-4444-4444-4444-444444444445	{"status": "suspended"}	{"status": "active"}	đi làm trở lại	\N	\N	\N	2026-10-16 07:06:14.693139+00
34	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:33:31.694081+00
35	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:33:44.001291+00
36	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444444	{"is_accepting_leads": true, "lead_assignment_order": 1}	{"is_accepting_leads": false}	\N	\N	\N	\N	2026-10-16 07:33:49.58734+00
37	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444444	{"is_accepting_leads": false, "lead_assignment_order": 1}	{"is_accepting_leads": true}	\N	\N	\N	\N	2026-10-16 07:33:51.684855+00
38	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444444	{"is_accepting_leads": true, "lead_assignment_order": 1}	{"is_accepting_leads": false}	\N	\N	\N	\N	2026-10-16 07:33:54.593576+00
39	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444444	{"is_accepting_leads": false, "lead_assignment_order": 1}	{"is_accepting_leads": true}	\N	\N	\N	\N	2026-10-16 07:33:57.088139+00
40	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444445	{"is_accepting_leads": true, "lead_assignment_order": 2}	{"is_accepting_leads": false}	\N	\N	\N	\N	2026-10-16 07:34:01.420193+00
41	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444445	{"is_accepting_leads": false, "lead_assignment_order": 2}	{"is_accepting_leads": true}	\N	\N	\N	\N	2026-10-16 07:35:19.518546+00
42	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:35:25.361132+00
43	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:42:30.464708+00
44	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:42:31.649237+00
45	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:42:32.483729+00
46	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:42:33.314784+00
47	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:42:35.324161+00
48	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:42:36.540099+00
49	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:42:37.728161+00
50	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:42:38.715682+00
51	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:42:39.75514+00
52	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:42:41.340205+00
53	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444"]}	\N	\N	\N	\N	2026-10-16 07:42:42.130658+00
60	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444445	{"is_accepting_leads": false, "lead_assignment_order": 1}	{"is_accepting_leads": true}	\N	\N	\N	\N	2026-10-16 07:43:08.778266+00
61	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444445	{"is_accepting_leads": true, "lead_assignment_order": 1}	{"is_accepting_leads": false}	\N	\N	\N	\N	2026-10-16 07:43:09.931947+00
62	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444445	{"is_accepting_leads": false, "lead_assignment_order": 1}	{"is_accepting_leads": true}	\N	\N	\N	\N	2026-10-16 07:43:11.81937+00
63	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:47:07.504207+00
64	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:47:08.420011+00
65	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:47:09.566227+00
66	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444444	{"is_accepting_leads": true, "lead_assignment_order": 1}	{"is_accepting_leads": false}	\N	\N	\N	\N	2026-10-16 07:48:04.571605+00
67	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444444	{"is_accepting_leads": false, "lead_assignment_order": 1}	{"is_accepting_leads": true}	\N	\N	\N	\N	2026-10-16 07:48:10.447863+00
68	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:49:34.704495+00
69	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:49:36.215601+00
70	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:49:37.265424+00
71	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:49:38.656379+00
72	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:49:39.773366+00
73	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:49:41.883527+00
74	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:49:43.332641+00
75	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:49:44.623953+00
76	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:49:45.919201+00
77	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:49:46.932763+00
78	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:49:47.941667+00
79	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:49:50.664043+00
80	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:49:51.823014+00
81	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:50:44.612243+00
82	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:50:47.184182+00
83	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:50:47.954653+00
84	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:50:49.046676+00
85	44444444-4444-4444-4444-444444444440	user.update_status	user	44444444-4444-4444-4444-444444444444	{"status": "active"}	{"status": "suspended"}	tạm nghỉ	\N	\N	\N	2026-10-16 07:52:16.30955+00
86	44444444-4444-4444-4444-444444444440	user.update_status	user	44444444-4444-4444-4444-444444444444	{"status": "suspended"}	{"status": "active"}	đi làm	\N	\N	\N	2026-10-16 07:52:26.371219+00
87	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:52:38.715715+00
88	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:52:40.216892+00
89	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:52:42.923108+00
90	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:52:44.262089+00
91	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:52:46.246546+00
92	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:52:47.406356+00
93	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:52:48.636199+00
94	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:52:49.931266+00
95	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:52:50.877725+00
96	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:56:13.640207+00
97	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:56:14.706689+00
98	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:56:15.944957+00
99	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:56:16.855284+00
100	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:56:17.898098+00
101	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:56:18.843425+00
102	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:56:20.130078+00
103	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:56:21.597625+00
104	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:56:22.687744+00
105	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:56:23.688135+00
106	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:56:28.320291+00
107	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:56:29.586514+00
108	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:34.057021+00
109	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:34.834987+00
110	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:43.196844+00
111	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:58:44.257061+00
112	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:45.392194+00
113	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:46.720112+00
114	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:48.283006+00
115	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:58:49.484474+00
116	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:50.605207+00
117	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:51.43243+00
118	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:52.620087+00
119	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:58:53.310079+00
120	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:54.046481+00
121	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:58:54.737103+00
122	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:59:33.095084+00
123	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:59:34.887603+00
124	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:59:39.173691+00
125	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 07:59:51.289609+00
126	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444"]}	\N	\N	\N	\N	2026-10-16 07:59:52.267672+00
127	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444"]}	\N	\N	\N	\N	2026-10-16 07:59:53.498159+00
128	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 07:59:56.381354+00
129	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:01:06.816339+00
130	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:04:49.906946+00
131	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444"]}	\N	\N	\N	\N	2026-10-16 08:04:50.922953+00
132	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:04:51.714381+00
133	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:04:53.479204+00
134	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444444	{"is_accepting_leads": true, "lead_assignment_order": 1}	{"is_accepting_leads": false}	\N	\N	\N	\N	2026-10-16 08:05:01.581582+00
135	44444444-4444-4444-4444-444444444440	user.update_lead_routing	user	44444444-4444-4444-4444-444444444444	{"is_accepting_leads": false, "lead_assignment_order": 1}	{"is_accepting_leads": true}	\N	\N	\N	\N	2026-10-16 08:05:02.373971+00
136	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 08:05:04.166971+00
137	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:09:28.875457+00
138	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 08:09:29.794198+00
139	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 08:09:30.872742+00
140	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 08:09:31.689354+00
141	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:09:32.510929+00
142	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 08:09:33.398411+00
143	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 08:09:34.639345+00
144	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 08:09:35.819046+00
145	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:09:37.086366+00
146	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:13:26.09047+00
147	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:13:27.25543+00
148	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:13:28.348353+00
149	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444"]}	\N	\N	\N	\N	2026-10-16 08:13:30.352344+00
150	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444444"]}	\N	\N	\N	\N	2026-10-16 08:14:08.007115+00
151	44444444-4444-4444-4444-444444444440	lead.update_status	lead	e175ff64-3196-4902-90a0-6e888c9a1adf	{"id": "e175ff64-3196-4902-90a0-6e888c9a1adf", "email": "huy.le@example.com", "notes": "Muốn bổ túc chẩn đoán động cơ GDI", "phone": "0987654321", "gender": "male", "source": "zalo", "address": "Đà Nẵng", "utm_term": null, "full_name": "Lê Quốc Huy", "created_at": "2026-10-07T09:40:52Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:40:52Z", "utm_medium": null, "utm_source": null, "assigned_at": null, "assigned_by": null, "assigned_to": null, "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1995-12-08", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": null, "assigned_to_email": null, "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000002", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ENG-EFI", "interested_course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi"}	{"id": "e175ff64-3196-4902-90a0-6e888c9a1adf", "email": "huy.le@example.com", "notes": "Muốn bổ túc chẩn đoán động cơ GDI", "phone": "0987654321", "gender": "male", "source": "zalo", "address": "Đà Nẵng", "utm_term": null, "full_name": "Lê Quốc Huy", "created_at": "2026-10-07T09:40:52Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-16T08:31:33Z", "utm_medium": null, "utm_source": null, "assigned_at": null, "assigned_by": null, "assigned_to": null, "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1995-12-08", "source_detail": null, "pipeline_status": "goi_lai_sau", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": null, "assigned_to_email": null, "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000002", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ENG-EFI", "interested_course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi"}	\N	\N	\N	\N	2026-10-16 08:31:33.481871+00
152	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 08:52:55.983852+00
153	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 08:52:58.596776+00
154	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 08:53:00.556286+00
155	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444446", "44444444-4444-4444-4444-444444444445"]}	\N	\N	\N	\N	2026-10-16 09:48:11.74925+00
156	44444444-4444-4444-4444-444444444440	user.reorder_lead_routing	user	44444444-4444-4444-4444-444444444440	\N	{"ordered_user_ids": ["44444444-4444-4444-4444-444444444444", "44444444-4444-4444-4444-444444444445", "44444444-4444-4444-4444-444444444446"]}	\N	\N	\N	\N	2026-10-16 09:48:14.218736+00
157	44444444-4444-4444-4444-444444444440	lead.update_status	lead	e755645d-f430-4fa4-9446-9bad6550fcf5	{"id": "e755645d-f430-4fa4-9446-9bad6550fcf5", "email": "huy.le@example.com", "notes": "Muốn bổ túc chẩn đoán động cơ GDI", "phone": "0987654777", "gender": "male", "source": "zalo", "address": "Đà Nẵng", "utm_term": null, "full_name": "Lê Quốc Khanh", "created_at": "2026-10-07T09:45:13Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-07T09:45:13Z", "utm_medium": null, "utm_source": null, "assigned_at": null, "assigned_by": null, "assigned_to": null, "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1995-12-08", "source_detail": null, "pipeline_status": "data_moi", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": null, "assigned_to_email": null, "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000002", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ENG-EFI", "interested_course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi"}	{"id": "e755645d-f430-4fa4-9446-9bad6550fcf5", "email": "huy.le@example.com", "notes": "Muốn bổ túc chẩn đoán động cơ GDI", "phone": "0987654777", "gender": "male", "source": "zalo", "address": "Đà Nẵng", "utm_term": null, "full_name": "Lê Quốc Khanh", "created_at": "2026-10-07T09:45:13Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-19T04:28:30Z", "utm_medium": null, "utm_source": null, "assigned_at": null, "assigned_by": null, "assigned_to": null, "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1995-12-08", "source_detail": null, "pipeline_status": "da_dang_ky", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": null, "assigned_to_email": null, "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000002", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ENG-EFI", "interested_course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi"}	\N	\N	\N	\N	2026-10-19 04:28:30.004164+00
158	44444444-4444-4444-4444-444444444440	order.create	order	ebb9ad8f-1657-4de7-bec7-5a12536db5f2	\N	{"id": "ebb9ad8f-1657-4de7-bec7-5a12536db5f2", "notes": null, "amount": 15000000, "status": "pending", "lead_id": "e755645d-f430-4fa4-9446-9bad6550fcf5", "paid_at": null, "class_id": "30000000-0000-0000-0000-000000000001", "course_id": "20000000-0000-0000-0000-000000000002", "lead_name": "Lê Quốc Khanh", "class_code": "K24-ELEC-A", "class_name": "Lớp Kỹ thuật Điện Ô tô K24 (Khóa Ban ngày)", "created_at": "2026-10-19T04:29:05Z", "created_by": "44444444-4444-4444-4444-444444444440", "order_code": "DH00000010", "student_id": null, "updated_at": "2026-10-19T04:29:05Z", "course_code": "AUTO-ENG-EFI", "course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi", "final_amount": 15000000, "discount_note": null, "payment_method": "pos", "discount_amount": 0, "created_by_email": "sale_admin@nsa.local"}	\N	\N	\N	\N	2026-10-19 04:29:05.837053+00
159	44444444-4444-4444-4444-444444444445	order.create	order	c0d7696c-791f-4494-bd1e-b06e4642e31e	\N	{"id": "c0d7696c-791f-4494-bd1e-b06e4642e31e", "notes": null, "amount": 15000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": null, "class_id": "30000000-0000-0000-0000-000000000001", "course_id": null, "lead_name": "Lê Hoàng Long", "class_code": "K24-ELEC-A", "class_name": "Lớp Kỹ thuật Điện Ô tô K24 (Khóa Ban ngày)", "created_at": "2026-10-19T07:30:36Z", "created_by": "44444444-4444-4444-4444-444444444445", "order_code": "DH00000011", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-19T07:30:36Z", "final_amount": 13000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": null, "discount_amount": 2000000, "created_by_email": "sale2@nsa.local"}	\N	\N	\N	\N	2026-10-19 07:30:36.267087+00
160	44444444-4444-4444-4444-444444444444	order.create	order	87f56518-91f0-448d-8554-89c5ce1bb291	\N	{"id": "87f56518-91f0-448d-8554-89c5ce1bb291", "notes": "[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 3 lần (40% - 30% - 30%)]\\n• Đợt 1 (40%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 2 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\\n• Đợt 3 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\\n<!--INSTALLMENT_DATA:{\\"plan_type\\":3,\\"total_installments\\":3,\\"installments\\":[{\\"round\\":1,\\"percentage\\":40,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":2,\\"percentage\\":30,\\"amount\\":9000000,\\"status\\":\\"pending\\"},{\\"round\\":3,\\"percentage\\":30,\\"amount\\":9000000,\\"status\\":\\"pending\\"}],\\"user_notes\\":\\"\\"}-->", "amount": 30000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555506", "paid_at": null, "class_id": "30000000-0000-0000-0000-000000000001", "course_id": null, "lead_name": "Hoàng Minh Tuấn", "class_code": "K24-ELEC-A", "class_name": "Lớp Kỹ thuật Điện Ô tô K24 (Khóa Ban ngày)", "created_at": "2026-10-19T09:37:47Z", "created_by": "44444444-4444-4444-4444-444444444444", "order_code": "DH00000012", "student_id": null, "updated_at": "2026-10-19T09:37:47Z", "final_amount": 30000000, "discount_note": null, "payment_method": null, "discount_amount": 0, "created_by_email": "sale@nsa.local"}	\N	\N	\N	\N	2026-10-19 09:37:47.775474+00
161	11111111-1111-1111-1111-111111111111	lead.update	lead	e755645d-f430-4fa4-9446-9bad6550fcf5	{"id": "e755645d-f430-4fa4-9446-9bad6550fcf5", "email": "huy.le@example.com", "notes": "Muốn bổ túc chẩn đoán động cơ GDI", "phone": "0987654777", "gender": "male", "source": "zalo", "address": "Đà Nẵng", "utm_term": null, "full_name": "Lê Quốc Khanh", "created_at": "2026-10-07T09:45:13Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-19T04:28:30Z", "utm_medium": null, "utm_source": null, "assigned_at": null, "assigned_by": null, "assigned_to": null, "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1995-12-08", "source_detail": null, "pipeline_status": "da_dang_ky", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": null, "assigned_to_email": null, "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000002", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ENG-EFI", "interested_course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi"}	{"id": "e755645d-f430-4fa4-9446-9bad6550fcf5", "email": "huy.le@example.com", "notes": "Muốn bổ túc chẩn đoán động cơ GDI e", "phone": "0987654777", "gender": "male", "source": "zalo", "address": "Đà Nẵng", "utm_term": null, "full_name": "Lê Quốc Khanh", "created_at": "2026-10-07T09:45:13Z", "created_by": "44444444-4444-4444-4444-444444444440", "updated_at": "2026-10-19T09:52:54Z", "utm_medium": null, "utm_source": null, "assigned_at": null, "assigned_by": null, "assigned_to": null, "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1995-12-08", "source_detail": null, "pipeline_status": "da_dang_ky", "created_by_email": "sale_admin@nsa.local", "assigned_by_email": null, "assigned_to_email": null, "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000002", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ENG-EFI", "interested_course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi"}	\N	\N	\N	\N	2026-10-19 09:52:54.314284+00
162	44444444-4444-4444-4444-444444444445	order.create	order	b3ff4ed0-984c-48d1-8bce-61066e555ba2	\N	{"id": "b3ff4ed0-984c-48d1-8bce-61066e555ba2", "notes": "[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 3 lần (40% - 30% - 30%)]\\n• Đợt 1 (40%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 2 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\\n• Đợt 3 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\\n<!--INSTALLMENT_DATA:{\\"plan_type\\":3,\\"total_installments\\":3,\\"installments\\":[{\\"round\\":1,\\"percentage\\":40,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":2,\\"percentage\\":30,\\"amount\\":9000000,\\"status\\":\\"pending\\"},{\\"round\\":3,\\"percentage\\":30,\\"amount\\":9000000,\\"status\\":\\"pending\\"}],\\"user_notes\\":\\"\\"}-->", "amount": 30000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": null, "class_id": "30000000-0000-0000-0000-000000000003", "course_id": null, "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-19T09:55:46Z", "created_by": "44444444-4444-4444-4444-444444444445", "order_code": "DH00000013", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-19T09:55:46Z", "final_amount": 30000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": null, "discount_amount": 0, "created_by_email": "sale2@nsa.local"}	\N	\N	\N	\N	2026-10-19 09:55:46.865264+00
163	44444444-4444-4444-4444-444444444445	order.update_status	order	b3ff4ed0-984c-48d1-8bce-61066e555ba2	{"id": "b3ff4ed0-984c-48d1-8bce-61066e555ba2", "notes": "[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 3 lần (40% - 30% - 30%)]\\n• Đợt 1 (40%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 2 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\\n• Đợt 3 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\\n<!--INSTALLMENT_DATA:{\\"plan_type\\":3,\\"total_installments\\":3,\\"installments\\":[{\\"round\\":1,\\"percentage\\":40,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":2,\\"percentage\\":30,\\"amount\\":9000000,\\"status\\":\\"pending\\"},{\\"round\\":3,\\"percentage\\":30,\\"amount\\":9000000,\\"status\\":\\"pending\\"}],\\"user_notes\\":\\"\\"}-->", "amount": 30000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": null, "class_id": "30000000-0000-0000-0000-000000000003", "course_id": null, "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-19T09:55:46Z", "created_by": "44444444-4444-4444-4444-444444444445", "order_code": "DH00000013", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-19T09:55:46Z", "final_amount": 30000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": null, "discount_amount": 0, "created_by_email": "sale2@nsa.local"}	{"id": "b3ff4ed0-984c-48d1-8bce-61066e555ba2", "notes": "[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 3 lần (40% - 30% - 30%)]\\n• Đợt 1 (40%): 12.000.000 đ - Đã thu (PT00000013-1, 12.000.000 đ)\\n• Đợt 2 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\\n• Đợt 3 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\\n<!--INSTALLMENT_DATA:{\\"plan_type\\":3,\\"total_installments\\":3,\\"installments\\":[{\\"round\\":1,\\"percentage\\":40,\\"amount\\":12000000,\\"status\\":\\"paid\\",\\"receipt_code\\":\\"PT00000013-1\\",\\"payment_method\\":\\"transfer\\",\\"paid_at\\":\\"2026-10-19T09:56:47.132Z\\",\\"collected_by_name\\":\\"sale2\\"},{\\"round\\":2,\\"percentage\\":30,\\"amount\\":9000000,\\"status\\":\\"pending\\"},{\\"round\\":3,\\"percentage\\":30,\\"amount\\":9000000,\\"status\\":\\"pending\\"}],\\"user_notes\\":\\"\\"}-->", "amount": 30000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": null, "class_id": "30000000-0000-0000-0000-000000000003", "course_id": null, "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-PRO", "class_name": "Lớp Chuyên đề An toàn & Pin Xe Điện EV K24", "created_at": "2026-10-19T09:55:46Z", "created_by": "44444444-4444-4444-4444-444444444445", "order_code": "DH00000013", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-19T09:56:47Z", "final_amount": 30000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "transfer", "discount_amount": 0, "created_by_email": "sale2@nsa.local"}	\N	\N	\N	\N	2026-10-19 09:56:47.069203+00
172	44444444-4444-4444-4444-444444444445	order.update_status	order	45c4d252-f329-4b71-b189-bea307684e11	{"id": "45c4d252-f329-4b71-b189-bea307684e11", "notes": "[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 5 lần (20% - 20% - 20% - 20% - 20%)]\\n• Đợt 1 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 2 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 3 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 4 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 5 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n<!--INSTALLMENT_DATA:{\\"plan_type\\":5,\\"total_installments\\":5,\\"installments\\":[{\\"round\\":1,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":2,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":3,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":4,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":5,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"}],\\"user_notes\\":\\"\\"}-->", "amount": 60000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": null, "class_id": "bac3914f-5942-417d-8c05-c1dce77661a7", "course_id": null, "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-T11A", "class_name": "Lớp An toàn & Pin Xe Điện EV K24 (Khai giảng 12/11 - Khóa Cuối tuần)", "created_at": "2026-10-20T06:35:04Z", "created_by": "44444444-4444-4444-4444-444444444445", "order_code": "DH00000015", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-20T06:35:04Z", "final_amount": 60000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": null, "discount_amount": 0, "created_by_email": "sale2@nsa.local"}	{"id": "45c4d252-f329-4b71-b189-bea307684e11", "notes": "[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 5 lần (20% - 20% - 20% - 20% - 20%)]\\n• Đợt 1 (20%): 12.000.000 đ - Đã thu (PT00000015-1, 12.000.000 đ)\\n• Đợt 2 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 3 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 4 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 5 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n<!--INSTALLMENT_DATA:{\\"plan_type\\":5,\\"total_installments\\":5,\\"installments\\":[{\\"round\\":1,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"paid\\",\\"receipt_code\\":\\"PT00000015-1\\",\\"payment_method\\":\\"transfer\\",\\"paid_at\\":\\"2026-10-20T06:35:25.488Z\\",\\"collected_by_name\\":\\"sale2\\"},{\\"round\\":2,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":3,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":4,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":5,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"}],\\"user_notes\\":\\"\\"}-->", "amount": 60000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": null, "class_id": "bac3914f-5942-417d-8c05-c1dce77661a7", "course_id": null, "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-T11A", "class_name": "Lớp An toàn & Pin Xe Điện EV K24 (Khai giảng 12/11 - Khóa Cuối tuần)", "created_at": "2026-10-20T06:35:04Z", "created_by": "44444444-4444-4444-4444-444444444445", "order_code": "DH00000015", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-20T06:35:24Z", "final_amount": 60000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "transfer", "discount_amount": 0, "created_by_email": "sale2@nsa.local"}	\N	\N	\N	\N	2026-10-20 06:35:24.90941+00
164	44444444-4444-4444-4444-444444444446	lead.update_status	lead	55555555-5555-5555-5555-555555555516	{"id": "55555555-5555-5555-5555-555555555516", "email": "phong.td@gmail.com", "notes": null, "phone": "0943221100", "gender": "male", "source": "website", "address": "Quận Thanh Xuân, Hà Nội", "utm_term": null, "full_name": "Tạ Đình Phong", "created_at": "2026-10-04T05:07:09Z", "created_by": "44444444-4444-4444-4444-444444444446", "updated_at": "2026-10-07T08:42:35Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-05T05:07:09Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444446", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1995-07-22", "source_detail": "Website Form tư vấn nghề", "pipeline_status": "follow", "created_by_email": "sale3@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale3@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000001", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ELEC-PRO", "interested_course_name": "Kỹ thuật Điện & Điện tử Ô tô Nâng cao"}	{"id": "55555555-5555-5555-5555-555555555516", "email": "phong.td@gmail.com", "notes": null, "phone": "0943221100", "gender": "male", "source": "website", "address": "Quận Thanh Xuân, Hà Nội", "utm_term": null, "full_name": "Tạ Đình Phong", "created_at": "2026-10-04T05:07:09Z", "created_by": "44444444-4444-4444-4444-444444444446", "updated_at": "2026-10-20T01:44:07Z", "utm_medium": null, "utm_source": null, "assigned_at": "2026-10-05T05:07:09Z", "assigned_by": "44444444-4444-4444-4444-444444444440", "assigned_to": "44444444-4444-4444-4444-444444444446", "utm_content": null, "converted_at": null, "converted_by": null, "utm_campaign": null, "date_of_birth": "1995-07-22", "source_detail": "Website Form tư vấn nghề", "pipeline_status": "da_dang_ky", "created_by_email": "sale3@nsa.local", "assigned_by_email": "sale_admin@nsa.local", "assigned_to_email": "sale3@nsa.local", "converted_student_id": null, "interested_course_id": "20000000-0000-0000-0000-000000000001", "converted_student_code": null, "converted_student_name": null, "interested_course_code": "AUTO-ELEC-PRO", "interested_course_name": "Kỹ thuật Điện & Điện tử Ô tô Nâng cao"}	\N	\N	\N	\N	2026-10-20 01:44:07.844309+00
165	11111111-1111-1111-1111-111111111111	class.create	class	e8be7d33-e657-4770-b97c-8c6a26a48a7d	\N	{"id": "e8be7d33-e657-4770-b97c-8c6a26a48a7d", "name": "L?p K? thu?t Di?n � t� K24 (Khai gi?ng 05/11 - Kh�a S�ng)", "status": "open", "end_date": "2027-02-05", "course_id": "20000000-0000-0000-0000-000000000001", "class_code": "K24-ELEC-T11A", "created_at": "2026-10-20T02:57:18.56499Z", "start_date": "2026-11-05", "updated_at": "2026-10-20T02:57:18.56499Z", "course_code": "AUTO-ELEC-PRO", "course_name": "Kỹ thuật Điện & Điện tử Ô tô Nâng cao", "maximum_students": 25, "enrolled_students": 0}	\N	\N	\N	\N	2026-10-20 02:57:18.56499+00
166	11111111-1111-1111-1111-111111111111	class.create	class	dbda0697-d0e3-47b8-99cf-4dd49b8673bd	\N	{"id": "dbda0697-d0e3-47b8-99cf-4dd49b8673bd", "name": "L?p K? thu?t Di?n � t� K24 (Khai gi?ng 15/11 - Kh�a T?i)", "status": "open", "end_date": "2027-02-15", "course_id": "20000000-0000-0000-0000-000000000001", "class_code": "K24-ELEC-T11B", "created_at": "2026-10-20T02:59:53.244713Z", "start_date": "2026-11-15", "updated_at": "2026-10-20T02:59:53.244713Z", "course_code": "AUTO-ELEC-PRO", "course_name": "Kỹ thuật Điện & Điện tử Ô tô Nâng cao", "maximum_students": 20, "enrolled_students": 0}	\N	\N	\N	\N	2026-10-20 02:59:53.244713+00
167	11111111-1111-1111-1111-111111111111	class.create	class	e3ab085d-2d34-4df5-8fe8-48a068926b52	\N	{"id": "e3ab085d-2d34-4df5-8fe8-48a068926b52", "name": "L?p Ch?n do�n D?ng co Xang/D?u K24 (Khai gi?ng 10/11 - Kh�a T?i)", "status": "open", "end_date": "2027-02-10", "course_id": "20000000-0000-0000-0000-000000000002", "class_code": "K24-ENG-T11", "created_at": "2026-10-20T02:59:53.94163Z", "start_date": "2026-11-10", "updated_at": "2026-10-20T02:59:53.94163Z", "course_code": "AUTO-ENG-EFI", "course_name": "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi", "maximum_students": 20, "enrolled_students": 0}	\N	\N	\N	\N	2026-10-20 02:59:53.94163+00
168	11111111-1111-1111-1111-111111111111	class.create	class	bac3914f-5942-417d-8c05-c1dce77661a7	\N	{"id": "bac3914f-5942-417d-8c05-c1dce77661a7", "name": "L?p An to�n & Pin Xe Di?n EV K24 (Khai gi?ng 12/11 - Kh�a Cu?i tu?n)", "status": "open", "end_date": "2027-02-12", "course_id": "20000000-0000-0000-0000-000000000003", "class_code": "K24-EV-T11A", "created_at": "2026-10-20T02:59:54.636461Z", "start_date": "2026-11-12", "updated_at": "2026-10-20T02:59:54.636461Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "maximum_students": 18, "enrolled_students": 0}	\N	\N	\N	\N	2026-10-20 02:59:54.636461+00
169	11111111-1111-1111-1111-111111111111	class.create	class	393c0c25-a09f-416b-9014-2de0029b4e84	\N	{"id": "393c0c25-a09f-416b-9014-2de0029b4e84", "name": "L?p Chuy�n d? Pin & D?ng co Hybrid EV K24 (Khai gi?ng 20/11 - Kh�a Chi?u)", "status": "open", "end_date": "2027-02-20", "course_id": "20000000-0000-0000-0000-000000000003", "class_code": "K24-EV-T11B", "created_at": "2026-10-20T02:59:55.334661Z", "start_date": "2026-11-20", "updated_at": "2026-10-20T02:59:55.334661Z", "course_code": "AUTO-EV-HYBRID", "course_name": "Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)", "maximum_students": 22, "enrolled_students": 0}	\N	\N	\N	\N	2026-10-20 02:59:55.334661+00
170	44444444-4444-4444-4444-444444444446	order.create	order	fb2f38cc-6950-4418-abbb-09f51dd31ba3	\N	{"id": "fb2f38cc-6950-4418-abbb-09f51dd31ba3", "notes": null, "amount": 15000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555516", "paid_at": null, "class_id": "e8be7d33-e657-4770-b97c-8c6a26a48a7d", "course_id": null, "lead_name": "Tạ Đình Phong", "class_code": "K24-ELEC-T11A", "class_name": "L?p K? thu?t Di?n � t� K24 (Khai gi?ng 05/11 - Kh�a S�ng)", "created_at": "2026-10-20T04:06:48Z", "created_by": "44444444-4444-4444-4444-444444444446", "order_code": "DH00000014", "student_id": null, "updated_at": "2026-10-20T04:06:48Z", "final_amount": 15000000, "discount_note": null, "payment_method": null, "discount_amount": 0, "created_by_email": "sale3@nsa.local"}	\N	\N	\N	\N	2026-10-20 04:06:48.701216+00
171	44444444-4444-4444-4444-444444444445	order.create	order	45c4d252-f329-4b71-b189-bea307684e11	\N	{"id": "45c4d252-f329-4b71-b189-bea307684e11", "notes": "[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 5 lần (20% - 20% - 20% - 20% - 20%)]\\n• Đợt 1 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 2 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 3 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 4 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 5 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n<!--INSTALLMENT_DATA:{\\"plan_type\\":5,\\"total_installments\\":5,\\"installments\\":[{\\"round\\":1,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":2,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":3,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":4,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":5,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"}],\\"user_notes\\":\\"\\"}-->", "amount": 60000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": null, "class_id": "bac3914f-5942-417d-8c05-c1dce77661a7", "course_id": null, "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-T11A", "class_name": "Lớp An toàn & Pin Xe Điện EV K24 (Khai giảng 12/11 - Khóa Cuối tuần)", "created_at": "2026-10-20T06:35:04Z", "created_by": "44444444-4444-4444-4444-444444444445", "order_code": "DH00000015", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-20T06:35:04Z", "final_amount": 60000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": null, "discount_amount": 0, "created_by_email": "sale2@nsa.local"}	\N	\N	\N	\N	2026-10-20 06:35:04.811525+00
173	44444444-4444-4444-4444-444444444445	order.update_status	order	45c4d252-f329-4b71-b189-bea307684e11	{"id": "45c4d252-f329-4b71-b189-bea307684e11", "notes": "[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 5 lần (20% - 20% - 20% - 20% - 20%)]\\n• Đợt 1 (20%): 12.000.000 đ - Đã thu (PT00000015-1, 12.000.000 đ)\\n• Đợt 2 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 3 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 4 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 5 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n<!--INSTALLMENT_DATA:{\\"plan_type\\":5,\\"total_installments\\":5,\\"installments\\":[{\\"round\\":1,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"paid\\",\\"receipt_code\\":\\"PT00000015-1\\",\\"payment_method\\":\\"transfer\\",\\"paid_at\\":\\"2026-10-20T06:35:25.488Z\\",\\"collected_by_name\\":\\"sale2\\"},{\\"round\\":2,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":3,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":4,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":5,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"}],\\"user_notes\\":\\"\\"}-->", "amount": 60000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": null, "class_id": "bac3914f-5942-417d-8c05-c1dce77661a7", "course_id": null, "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-T11A", "class_name": "Lớp An toàn & Pin Xe Điện EV K24 (Khai giảng 12/11 - Khóa Cuối tuần)", "created_at": "2026-10-20T06:35:04Z", "created_by": "44444444-4444-4444-4444-444444444445", "order_code": "DH00000015", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-20T06:35:24Z", "final_amount": 60000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "transfer", "discount_amount": 0, "created_by_email": "sale2@nsa.local"}	{"id": "45c4d252-f329-4b71-b189-bea307684e11", "notes": "[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 5 lần (20% - 20% - 20% - 20% - 20%)]\\n• Đợt 1 (20%): 12.000.000 đ - Đã thu (PT00000015-1, 12.000.000 đ)\\n• Đợt 2 (20%): 12.000.000 đ - Đã thu (PT00000015-2, 12.000.000 đ)\\n• Đợt 3 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 4 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n• Đợt 5 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\\n<!--INSTALLMENT_DATA:{\\"plan_type\\":5,\\"total_installments\\":5,\\"installments\\":[{\\"round\\":1,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"paid\\",\\"receipt_code\\":\\"PT00000015-1\\",\\"payment_method\\":\\"transfer\\",\\"paid_at\\":\\"2026-10-20T06:35:25.488Z\\",\\"collected_by_name\\":\\"sale2\\"},{\\"round\\":2,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"paid\\",\\"receipt_code\\":\\"PT00000015-2\\",\\"payment_method\\":\\"cash\\",\\"paid_at\\":\\"2026-10-20T06:37:09.307Z\\",\\"collected_by_name\\":\\"sale2\\"},{\\"round\\":3,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":4,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"},{\\"round\\":5,\\"percentage\\":20,\\"amount\\":12000000,\\"status\\":\\"pending\\"}],\\"user_notes\\":\\"\\"}-->", "amount": 60000000, "status": "pending", "lead_id": "55555555-5555-5555-5555-555555555503", "paid_at": null, "class_id": "bac3914f-5942-417d-8c05-c1dce77661a7", "course_id": null, "lead_name": "Lê Hoàng Long", "class_code": "K24-EV-T11A", "class_name": "Lớp An toàn & Pin Xe Điện EV K24 (Khai giảng 12/11 - Khóa Cuối tuần)", "created_at": "2026-10-20T06:35:04Z", "created_by": "44444444-4444-4444-4444-444444444445", "order_code": "DH00000015", "student_id": "5fe4edef-3498-46fe-a735-2d3fd7dad19e", "updated_at": "2026-10-20T06:37:08Z", "final_amount": 60000000, "student_code": "HV00000018", "student_name": "Lê Hoàng Long", "discount_note": null, "payment_method": "cash", "discount_amount": 0, "created_by_email": "sale2@nsa.local"}	\N	\N	\N	\N	2026-10-20 06:37:08.753392+00
174	44444444-4444-4444-4444-444444444445	lead.convert	lead	29f90334-81ed-4a1c-823b-7f4bda771b1b	\N	{"student_id": "eb8b759a-d60d-4efa-a850-270d1e18ddc9", "student_code": "HV00000019"}	\N	\N	\N	\N	2026-10-21 03:42:03.751931+00
\.


--
-- Data for Name: certificates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.certificates (id, completion_id, certificate_number, verification_code, issued_by, issued_at, revoked_at, revoked_by, revoke_reason, is_current, created_at, diploma_file_url, diploma_file_name, diploma_uploaded_at, diploma_uploaded_by) FROM stdin;
\.


--
-- Data for Name: class_enrollment_periods; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.class_enrollment_periods (id, enrollment_id, started_at, ended_at, created_by, ended_by, start_reason, end_reason, created_at) FROM stdin;
429e87dd-5625-4281-9691-90b71e7f7e42	9d8f7474-79e4-42c8-927d-83947980bb61	2026-10-20 08:52:17.157356+00	\N	11111111-1111-1111-1111-111111111111	\N	Ghi danh vào lớp	\N	2026-10-20 08:52:17.157356+00
df06bcef-f1be-4dc0-b278-75937177a464	c6603a8d-8b84-478b-94ad-592d6cb1ddec	2026-10-20 08:52:17.283079+00	\N	11111111-1111-1111-1111-111111111111	\N	Ghi danh vào lớp	\N	2026-10-20 08:52:17.283079+00
9cc1c1ea-c963-4a2b-89e2-c15050663255	d7d7b29f-26e4-4db8-b26d-6cc60362781a	2026-10-20 08:52:17.399023+00	\N	11111111-1111-1111-1111-111111111111	\N	Ghi danh vào lớp	\N	2026-10-20 08:52:17.399023+00
4236786b-cdad-477e-83db-1567616ee0fc	eee25a1a-b2c9-4e14-941b-8ff561a452a3	2026-10-20 08:52:17.514906+00	\N	11111111-1111-1111-1111-111111111111	\N	Ghi danh vào lớp	\N	2026-10-20 08:52:17.514906+00
313e0916-a28e-489b-bedc-248643b2fe5b	b5a62c18-dcdc-4911-b5dc-b8370ef2543a	2026-10-20 08:52:17.63537+00	\N	11111111-1111-1111-1111-111111111111	\N	Ghi danh vào lớp	\N	2026-10-20 08:52:17.63537+00
09fbbbe1-5aec-435c-83fb-ed68b3a185c5	07f24244-c4d4-4fa5-8710-d2c0f563649a	2026-10-20 08:52:17.750901+00	\N	11111111-1111-1111-1111-111111111111	\N	Ghi danh vào lớp	\N	2026-10-20 08:52:17.750901+00
\.


--
-- Data for Name: class_enrollments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.class_enrollments (id, class_id, student_id, status, enrolled_at, ended_at, created_by, created_at, updated_at) FROM stdin;
9d8f7474-79e4-42c8-927d-83947980bb61	3c80de01-543c-4e81-bb02-a4da1aec69b4	3fe6a64b-798c-4b83-a752-28ebfc57c546	enrolled	2026-10-20 08:52:17.157356+00	\N	11111111-1111-1111-1111-111111111111	2026-10-20 08:52:17.157356+00	2026-10-20 08:52:17.157356+00
c6603a8d-8b84-478b-94ad-592d6cb1ddec	71ac3ae4-4c00-4c52-abbd-7ab66e325a2e	fc4b6416-ee74-492e-a13f-1897064a779a	enrolled	2026-10-20 08:52:17.283079+00	\N	11111111-1111-1111-1111-111111111111	2026-10-20 08:52:17.283079+00	2026-10-20 08:52:17.283079+00
d7d7b29f-26e4-4db8-b26d-6cc60362781a	5c342c7a-d802-41e0-aafd-9ad1c2a19864	98a56a05-dbf9-477b-a3d4-7d200140f1db	enrolled	2026-10-20 08:52:17.399023+00	\N	11111111-1111-1111-1111-111111111111	2026-10-20 08:52:17.399023+00	2026-10-20 08:52:17.399023+00
eee25a1a-b2c9-4e14-941b-8ff561a452a3	3c80de01-543c-4e81-bb02-a4da1aec69b4	2cff9c13-87ce-4522-bf3d-618bd6069857	enrolled	2026-10-20 08:52:17.514906+00	\N	11111111-1111-1111-1111-111111111111	2026-10-20 08:52:17.514906+00	2026-10-20 08:52:17.514906+00
b5a62c18-dcdc-4911-b5dc-b8370ef2543a	71ac3ae4-4c00-4c52-abbd-7ab66e325a2e	781cf431-6bb1-4209-8708-069177eb0325	enrolled	2026-10-20 08:52:17.63537+00	\N	11111111-1111-1111-1111-111111111111	2026-10-20 08:52:17.63537+00	2026-10-20 08:52:17.63537+00
07f24244-c4d4-4fa5-8710-d2c0f563649a	5c342c7a-d802-41e0-aafd-9ad1c2a19864	5fe4edef-3498-46fe-a735-2d3fd7dad19e	enrolled	2026-10-20 08:52:17.750901+00	\N	11111111-1111-1111-1111-111111111111	2026-10-20 08:52:17.750901+00	2026-10-20 08:52:17.750901+00
\.


--
-- Data for Name: class_operation_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.class_operation_history (id, class_id, event_type, entity_type, entity_id, reason, details, actor_user_id, occurred_at) FROM stdin;
\.


--
-- Data for Name: class_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.class_sessions (id, class_id, course_id, module_id, teacher_id, location_id, title, session_type, starts_at, ends_at, status, attendance_locked_at, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: classes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.classes (id, course_id, class_code, name, start_date, end_date, maximum_students, status, created_at, updated_at) FROM stdin;
3c80de01-543c-4e81-bb02-a4da1aec69b4	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	SSS-3H024-2D001	SSS-3H024-2D001	2026-11-06	2026-12-06	20	planning	2026-10-20 08:52:15.422578+00	2026-10-20 08:52:15.422578+00
8799c755-15a0-4dd8-aeec-1398d628ce4e	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	SSS-3H024-3D001	SSS-3H024-3D001	2026-11-10	2026-12-10	20	planning	2026-10-20 08:52:15.519472+00	2026-10-20 08:52:15.519472+00
5c342c7a-d802-41e0-aafd-9ad1c2a19864	fc6e1c63-5f05-423b-bb14-26df0473ce1a	ASP-4H120-2D001	ASP-4H120-2D001	2026-11-12	2027-01-15	25	planning	2026-10-20 08:52:15.610445+00	2026-10-20 08:52:15.610445+00
7337c3cb-2205-4bc3-9919-ee8286691426	6be85810-b3ed-4ade-a04e-daf37ac9da41	PAS-4H120-3D001	PAS-4H120-3D001	2026-11-15	2027-01-20	20	planning	2026-10-20 08:52:15.70159+00	2026-10-20 08:52:15.70159+00
71ac3ae4-4c00-4c52-abbd-7ab66e325a2e	1db8ae53-f2a3-4193-8c6e-4da2be157651	PAR-4H300-2D001	PAR-4H300-2D001	2026-11-05	2027-04-10	25	planning	2026-10-20 08:52:15.792509+00	2026-10-20 08:52:15.792509+00
44321deb-aa38-4c65-ab4a-9cfdac590818	1db8ae53-f2a3-4193-8c6e-4da2be157651	PAR-4H300-3D001	PAR-4H300-3D001	2026-11-18	2027-04-25	20	planning	2026-10-20 08:52:15.884068+00	2026-10-20 08:52:15.884068+00
03298517-ea2e-4f40-a12b-76f09421eedd	211cb244-618b-42b4-91ba-0b358aec568b	EST-4H40-2D001	EST-4H40-2D001	2026-11-20	2026-12-25	20	planning	2026-10-20 08:52:15.975626+00	2026-10-20 08:52:15.975626+00
13723849-466b-4d1e-ac71-94115ec3bec5	0e028d3a-fd2f-4b6c-b895-ee0ee67c8bd0	ADT-4H084-3D001	ADT-4H084-3D001	2026-11-22	2027-01-10	20	planning	2026-10-20 08:52:16.066948+00	2026-10-20 08:52:16.066948+00
\.


--
-- Data for Name: competency_criteria; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.competency_criteria (id, course_id, module_id, code, name, description, is_required, sequence_no, created_at, updated_at) FROM stdin;
22000000-0000-0000-0000-000000000001	20000000-0000-0000-0000-000000000001	21000000-0000-0000-0000-000000000001	CRIT-ELEC-01	Kỹ năng đo kiểm xung CAN-High/CAN-Low	Sử dụng Oscilloscope đo dạng sóng tín hiệu mạng CAN và xác định ngắn mạch/hở mạch	t	1	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
22000000-0000-0000-0000-000000000002	20000000-0000-0000-0000-000000000001	21000000-0000-0000-0000-000000000002	CRIT-ELEC-02	Chẩn đoán mã lỗi DTC và phân tích Data List	Đọc mã lỗi hệ thống BCM, phân tích các giá trị cảm biến trên máy chẩn đoán chuyên dụng	t	2	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
22000000-0000-0000-0000-000000000003	20000000-0000-0000-0000-000000000001	21000000-0000-0000-0000-000000000003	CRIT-ELEC-03	An toàn điện và quy trình 5S xưởng dịch vụ	Tuân thủ quy định bảo hộ lao động, ngắt cọc âm ắc quy đúng kỹ thuật và giữ vệ sinh xưởng	t	3	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
\.


--
-- Data for Name: completion_decision_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.completion_decision_history (id, completion_id, status, attendance_pct, required_competencies_met, required_competencies_total, note, decided_by, decided_at, required_tests_passed, required_tests_total, final_exam_score) FROM stdin;
\.


--
-- Data for Name: course_completions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.course_completions (id, class_id, student_id, attendance_pct, required_competencies_met, required_competencies_total, status, reviewed_by, reviewed_at, review_note, created_at, updated_at, course_id, required_tests_passed, required_tests_total, final_exam_score) FROM stdin;
\.


--
-- Data for Name: course_modules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.course_modules (id, course_id, code, name, sequence_no, planned_sessions, description, created_at, updated_at) FROM stdin;
21000000-0000-0000-0000-000000000001	20000000-0000-0000-0000-000000000001	ELEC-M01	Mạng giao tiếp trên xe (CAN/LIN Bus)	1	4	Nguyên lý truyền thông, đo xung tín hiệu oscilloscope, chẩn đoán lỗi mạng.	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
21000000-0000-0000-0000-000000000002	20000000-0000-0000-0000-000000000001	ELEC-M02	Hệ thống Điện Thân xe & BCM thông minh	2	4	Hệ thống Smart Key, gạt mưa tự động, đèn pha thích ứng và Body Control Module.	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
21000000-0000-0000-0000-000000000003	20000000-0000-0000-0000-000000000001	ELEC-M03	Chẩn đoán Nâng cao bằng Máy Scan Chuyên hãng	3	4	Phân tích Data stream, kích hoạt kiểm tra cơ cấu chấp hành, cài đặt chìa khóa.	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
21000000-0000-0000-0000-000000000004	20000000-0000-0000-0000-000000000002	ENG-M01	Hệ thống Phun xăng Trực tiếp GDI	1	6	Cấu tạo bơm cao áp, kim phun điện từ, cảm biến áp suất ray nhiên liệu.	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
21000000-0000-0000-0000-000000000005	20000000-0000-0000-0000-000000000002	ENG-M02	Hệ thống Phun dầu Điện tử Common Rail Diesel	2	6	Bơm cao áp CP4, kim phun Piezo, van điều khiển áp suất SCV/DRV.	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
21000000-0000-0000-0000-000000000006	20000000-0000-0000-0000-000000000002	ENG-M03	Hệ thống Xử lý Khí thải DPF & SCR (AdBlue)	3	4	Bầu lọc hạt DPF, hệ thống phun Urea SCR và cảm biến NOx.	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
21000000-0000-0000-0000-000000000007	20000000-0000-0000-0000-000000000003	EV-M01	An toàn Điện Cao áp & Cầu dao ngắt khẩn cấp	1	3	Trang bị bảo hộ cấp điện áp 1000V, kiểm tra cách điện Megohmmeter, cô lập hệ thống pin cao áp.	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
21000000-0000-0000-0000-000000000008	20000000-0000-0000-0000-000000000003	EV-M02	Quản lý Pin Cao áp BMS & Làm mát Pin	2	4	Cân bằng cell pin, kiểm tra nhiệt độ pack pin, xử lý lỗi sạc DC sạc nhanh.	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
21000000-0000-0000-0000-000000000009	20000000-0000-0000-0000-000000000003	EV-M03	Hệ thống Truyền lực Điện & Phanh tái sinh	3	3	Inverter điều khiển MG1/MG2, phanh tái sinh điện năng Regenerative Braking.	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
cccccccc-cccc-cccc-cccc-cccccccccccc	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	E2E-M01	Mô-đun E2E	1	8	\N	2026-10-09 07:36:14.40649+00	2026-10-09 07:36:14.40649+00
\.


--
-- Data for Name: course_tests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.course_tests (id, course_id, code, title, kind, pass_score, is_required, sequence_no, is_active, created_at, updated_at) FROM stdin;
41b3d3f1-7133-4528-8a5b-3c67b66778dc	20000000-0000-0000-0000-000000000001	KT01	Kiểm tra lý thuyết 2	class_test	5.00	t	1	t	2026-08-20 06:31:19.961156+00	2026-08-20 06:31:19.961156+00
a7760339-074d-4168-8bc3-8bbb5262cbf4	20000000-0000-0000-0000-000000000001	KT02	Kiểm tra thực hành 2	class_test	5.00	t	2	t	2026-08-20 06:33:02.170838+00	2026-08-20 06:33:02.170838+00
\.


--
-- Data for Name: courses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.courses (id, code, name, description, total_sessions, minimum_attendance_pct, status, created_at, updated_at) FROM stdin;
20000000-0000-0000-0000-000000000001	AUTO-ELEC-PRO	Kỹ thuật Điện & Điện tử Ô tô Nâng cao	Đào tạo chuyên sâu về hệ thống mạng giao tiếp CAN/LIN bus, cảm biến, cơ cấu chấp hành và chẩn đoán điện thân xe thế hệ mới.	12	80.00	active	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
20000000-0000-0000-0000-000000000002	AUTO-ENG-EFI	Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi	Nắm vững hệ thống nhiên liệu áp suất cao GDI và Common Rail Diesel, xử lý hiện tượng bỏ máy, khói đen, hao xăng.	16	80.00	active	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
20000000-0000-0000-0000-000000000003	AUTO-EV-HYBRID	Kỹ thuật An toàn & Bảo dưỡng Xe Điện & Xe Hybrid (EV/HEV)	Quy trình an toàn điện cao áp (High Voltage Safety), cấu tạo pack pin Lithium-ion, bộ biến tần Inverter và động cơ điện đồng bộ nam châm vĩnh cửu.	10	80.00	active	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	E2E-COURSE	Khóa học kiểm thử E2E	Dữ liệu giả chỉ dùng trong CI.	8	80.00	active	2026-10-09 07:36:14.40649+00	2026-10-09 07:36:14.40649+00
54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	SSS-3H024	KỸ NĂNG BÁN HÀNG SHOWROOM	Showroom Sales Skills	8	80.00	active	2026-10-20 08:52:13.859756+00	2026-10-20 08:52:13.859756+00
fc6e1c63-5f05-423b-bb14-26df0473ce1a	ASP-4H120	CHUYÊN VIÊN KINH DOANH Ô TÔ	Automotive Sales Professional	30	80.00	active	2026-10-20 08:52:13.961317+00	2026-10-20 08:52:13.961317+00
6be85810-b3ed-4ade-a04e-daf37ac9da41	PAS-4H120	CỐ VẤN DỊCH VỤ Ô TÔ CHUYÊN NGHIỆP	Professional Automotive Service Advisor	30	80.00	active	2026-10-20 08:52:14.052205+00	2026-10-20 08:52:14.052205+00
1db8ae53-f2a3-4193-8c6e-4da2be157651	PAR-4H300	KỸ THUẬT SỬA CHỮA Ô TÔ	Practical Automotive Repair	75	80.00	active	2026-10-20 08:52:14.143248+00	2026-10-20 08:52:14.143248+00
f7c39551-34fa-4927-b3a9-6bbbfe259c62	PBA-4H048	KHÓA NHẬP MÔN PRE-BASIC	Pre-Basic Automotive	12	80.00	active	2026-10-20 08:52:14.234873+00	2026-10-20 08:52:14.234873+00
081890e9-bfd6-43c0-a7ce-45b702b06706	BAB-4H140	KỸ THUẬT ĐỒNG SƠN Ô TÔ CƠ BẢN	Basic Auto Body	35	80.00	active	2026-10-20 08:52:14.326237+00	2026-10-20 08:52:14.326237+00
52dc0b3f-41f9-4484-8f3e-125ed6432ba5	BABD-4H080	KỸ THUẬT SỬA CHỮA THÂN VỎ Ô TÔ CƠ BẢN (ĐỒNG)	Basic Auto Body Repair	20	80.00	active	2026-10-20 08:52:14.417217+00	2026-10-20 08:52:14.417217+00
763c5fd5-dd19-409e-97d2-9dfda458dc7b	BABS-4H060	KỸ THUẬT SƠN Ô TÔ CƠ BẢN (SƠN)	Basic Auto Painting	15	80.00	active	2026-10-20 08:52:14.508261+00	2026-10-20 08:52:14.508261+00
36fb226f-b799-4325-b17d-2390ad31c146	AAB-4H400	KỸ THUẬT ĐỒNG SƠN Ô TÔ NÂNG CAO	Advanced Auto Body	100	80.00	active	2026-10-20 08:52:14.599746+00	2026-10-20 08:52:14.599746+00
71d4a499-ade0-4376-a1c3-e166dbc14fe9	AABD-4H240	KỸ THUẬT SỬA CHỮA THÂN VỎ Ô TÔ NÂNG CAO (ĐỒNG)	Advanced Auto Body Repair	60	80.00	active	2026-10-20 08:52:14.69075+00	2026-10-20 08:52:14.69075+00
6db70ead-fab7-4e80-b93c-02baa3095801	AABS-4H160	KỸ THUẬT SƠN Ô TÔ CƠ NÂNG CAO (SƠN)	Advanced Auto Painting	40	80.00	active	2026-10-20 08:52:14.782257+00	2026-10-20 08:52:14.782257+00
3a193cf2-fe96-438d-b6d5-4524fce59919	SED-3H015	PHÁT TRIỂN NĂNG LỰC CV KINH DOANH	Sales Executive Development	5	80.00	active	2026-10-20 08:52:14.873325+00	2026-10-20 08:52:14.873325+00
211cb244-618b-42b4-91ba-0b358aec568b	EST-4H40	BẢO DƯỠNG NHANH	Express Service Technology	10	80.00	active	2026-10-20 08:52:14.964227+00	2026-10-20 08:52:14.964227+00
281dbe79-4430-4248-b923-44f060cc8483	ADS-3H015	KỸ THUẬT CHẠY QUẢNG CÁO	Advertising & Digital Skills	5	80.00	active	2026-10-20 08:52:15.055325+00	2026-10-20 08:52:15.055325+00
96a3c06f-4c9c-49a9-9e2a-10001088e137	AFS-3H003	PHONG THỦY ỨNG DỤNG TRONG KINH DOANH Ô TÔ	Applied Feng Shui	1	80.00	active	2026-10-20 08:52:15.146504+00	2026-10-20 08:52:15.146504+00
0e028d3a-fd2f-4b6c-b895-ee0ee67c8bd0	ADT-4H084	KỸ THUẬT LÀM ĐẸP XE (Detailing)	Auto Detailing Technique	21	80.00	active	2026-10-20 08:52:15.237493+00	2026-10-20 08:52:15.237493+00
37dba074-00da-4545-8e48-f84c6161ddc4	CCS-4H080	CHĂM SÓC KHÁCH HÀNG	Customer Care Service	20	80.00	active	2026-10-20 08:52:15.328564+00	2026-10-20 08:52:15.328564+00
\.


--
-- Data for Name: goose_db_version; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.goose_db_version (id, version_id, is_applied, tstamp) FROM stdin;
1	0	t	2026-08-20 04:59:22.472052
2	1	t	2026-10-07 03:54:13.735215
3	2	t	2026-10-07 03:54:13.735215
4	3	t	2026-10-07 03:54:13.735215
5	4	t	2026-10-07 03:54:13.735215
6	5	t	2026-10-07 03:54:13.735215
7	6	t	2026-10-07 03:54:13.735215
8	7	t	2026-10-07 03:54:13.735215
9	8	t	2026-10-07 03:54:13.735215
10	9	t	2026-10-07 03:54:13.735215
11	10	t	2026-10-07 03:54:13.735215
12	11	t	2026-10-07 03:54:13.735215
13	12	t	2026-10-07 03:54:13.735215
14	13	t	2026-10-07 03:54:13.735215
15	14	t	2026-10-07 03:54:30.241967
16	15	t	2026-10-07 04:30:12.274425
17	16	t	2026-10-09 04:59:41.394368
18	17	t	2026-10-16 07:20:40.101897
19	18	t	2026-10-19 06:51:43.253839
\.


--
-- Data for Name: lead_interactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lead_interactions (id, lead_id, channel, summary, outcome, created_by, created_at) FROM stdin;
577dd3e5-736a-40dd-aba7-79d9b7d653eb	55555555-5555-5555-5555-555555555502	phone_call	Trao đổi qua điện thoại về lộ trình 10 buổi khóa An toàn & Xe Điện EV	Khách đề nghị gửi đề cương chi tiết môn học qua Zalo để xem trước	44444444-4444-4444-4444-444444444444	2026-10-05 05:07:09.706+00
0bc3bb12-db16-41e3-b3ea-b786fe2560fa	55555555-5555-5555-5555-555555555502	zalo	Đã kết bạn Zalo và gửi file PDF giáo trình chi tiết + bảng học phí ưu đãi	Khách đã xem, phản hồi tích cực và hẹn đăng ký lớp tối thứ 3-5-7	44444444-4444-4444-4444-444444444444	2026-10-06 05:07:09.706+00
a8eda62d-7a14-4487-a6e0-42f281c57d54	55555555-5555-5555-5555-555555555503	phone_call	Gọi điện tư vấn lần đầu cho khách	Khách đang bận họp bàn giao ca xưởng, hẹn gọi lại sau 17h30	44444444-4444-4444-4444-444444444445	2026-10-06 05:07:09.706+00
dea3cbe0-ce13-47ee-a5cc-a185dc0c1133	55555555-5555-5555-5555-555555555504	in_person	Khách ghé trung tâm tham quan phòng lab ô tô và các mô hình chẩn đoán động cơ	Rất ấn tượng với trang thiết bị, hẹn rủ thêm 1 đồng nghiệp cùng đăng ký	44444444-4444-4444-4444-444444444444	2026-10-04 05:07:09.706+00
dd74d020-d95c-48fa-8dcb-0011053784e8	55555555-5555-5555-5555-555555555504	phone_call	Gọi hỏi thăm tình hình đồng nghiệp và chốt lịch học	Đang chờ đồng nghiệp sắp xếp ca trực để chốt cả 2 suất	44444444-4444-4444-4444-444444444444	2026-10-06 05:07:09.706+00
c7b96caa-7716-496b-8f15-e7f3f5f9d07f	55555555-5555-5555-5555-555555555505	phone_call	Gọi 2 cuộc liên tiếp lúc 9h sáng và 14h chiều	Thuê bao không liên lạc được, đã gửi SMS giới thiệu	44444444-4444-4444-4444-444444444445	2026-10-06 05:07:09.706+00
89f8c6f6-1e1c-422a-8d32-ccddc8e2adc7	55555555-5555-5555-5555-555555555506	phone_call	Tư vấn chuyên sâu về khóa K24-EV-PRO và hướng dẫn thủ tục nhập học	Khách đồng ý đăng ký, xin số tài khoản trung tâm để chuyển khoản đặt cọc	44444444-4444-4444-4444-444444444444	2026-10-05 05:07:09.706+00
205f7a79-cc01-48c2-b58f-5f74a37b21c6	55555555-5555-5555-5555-555555555506	zalo	Gửi thông tin tài khoản ngân hàng và hợp đồng đào tạo qua Zalo	Khách xác nhận đã nhận được hợp đồng	44444444-4444-4444-4444-444444444444	2026-10-06 05:07:09.706+00
f9f84eae-a4e4-4c2c-af4f-e5de94b3e0a2	55555555-5555-5555-5555-555555555507	in_person	Khách đến trung tâm làm thủ tục nhập học và đóng học phí trực tiếp	Hoàn tất thủ tục, xếp lớp K24-ELEC-A	44444444-4444-4444-4444-444444444444	2026-09-27 05:07:09.706+00
4a7cedd5-1023-4800-ab29-b2cbd2a0b293	55555555-5555-5555-5555-555555555508	phone_call	Liên hệ tư vấn khóa động cơ GDI/CRDi	Khách báo vừa nhận quyết định điều chuyển công tác vào TP.HCM nên không học được	44444444-4444-4444-4444-444444444445	2026-10-02 05:07:09.706+00
84f8ad36-ffda-460d-b2aa-1b14bc1ab267	55555555-5555-5555-5555-555555555512	phone_call	Tư vấn lớp K24-ENG-B buổi tối	Khách muốn tìm hiểu kỹ phần đo kiểm kim phun Common Rail	44444444-4444-4444-4444-444444444446	2026-10-05 05:07:09.706+00
b44f6802-5fcd-4dbf-b285-47003db43744	55555555-5555-5555-5555-555555555513	facebook	Tư vấn qua fanpage cho đại diện Gara Sơn	Gara đồng ý thanh toán cho nhân viên, chờ gửi hóa đơn VAT	44444444-4444-4444-4444-444444444445	2026-10-04 05:07:09.706+00
eb0feaab-d76d-48e6-8dd5-2ff6752fa4bd	55555555-5555-5555-5555-555555555516	in_person	Tiếp đón khách tham quan cơ sở vật chất phòng học điện ô tô	Khách hài lòng, hẹn nộp hồ sơ trước ngày khai giảng	44444444-4444-4444-4444-444444444446	2026-10-05 05:07:09.706+00
3f069cae-a7cc-4ba1-85eb-68c89f681526	55555555-5555-5555-5555-555555555518	phone_call	Gọi tư vấn khóa điện nâng cao	Khách đang thi học kỳ trường ĐH Giao thông Vận tải, hẹn thi xong sẽ đăng ký	44444444-4444-4444-4444-444444444444	2026-10-06 05:07:09.706+00
18c66f19-6c79-45cb-a0f0-f59e3af6cd64	55555555-5555-5555-5555-555555555519	zalo	Tư vấn gói học xe điện EV nâng cao và chính sách hỗ trợ việc làm	Khách chuyển khoản thanh toán học phí thành công	44444444-4444-4444-4444-444444444446	2026-10-06 05:07:09.706+00
\.


--
-- Data for Name: lead_pipeline_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lead_pipeline_history (id, lead_id, old_status, new_status, reason, changed_by, changed_at) FROM stdin;
bafbc6c7-93f5-4d68-ba1b-1f5b2ff80d21	55555555-5555-5555-5555-555555555502	data_moi	follow	Đã liên hệ cuộc gọi đầu tiên và khách quan tâm khóa học	44444444-4444-4444-4444-444444444444	2026-10-05 05:07:09.706+00
8421bf56-02be-47fe-a7d4-1397be1574da	55555555-5555-5555-5555-555555555503	data_moi	goi_lai_sau	Khách đang bận họp, hẹn liên hệ lại cuối giờ chiều	44444444-4444-4444-4444-444444444445	2026-10-06 05:07:09.706+00
7ec51c37-c3c7-44b3-8ed3-8f6d14988899	55555555-5555-5555-5555-555555555504	data_moi	follow	Khách tới xem trực tiếp cơ sở thực hành	44444444-4444-4444-4444-444444444444	2026-10-04 05:07:09.706+00
ba5bd8f6-672c-4021-b01a-44dac368e3d0	55555555-5555-5555-5555-555555555505	data_moi	knm_thue_bao	Gọi 2 lần đều không liên lạc được	44444444-4444-4444-4444-444444444445	2026-10-06 05:07:09.706+00
d81ed1fb-fdba-4643-b3ac-2f6874641582	55555555-5555-5555-5555-555555555506	data_moi	follow	Tư vấn chương trình đào tạo ô tô điện	44444444-4444-4444-4444-444444444444	2026-10-03 05:07:09.706+00
12ffef4b-0697-4c17-b915-645a4972b7f2	55555555-5555-5555-5555-555555555506	follow	da_dang_ky	Khách chốt đăng ký, tạo đơn hàng thanh toán	44444444-4444-4444-4444-444444444444	2026-10-05 05:07:09.706+00
99a3d458-d57d-4652-b4ec-ee4186b03cc7	55555555-5555-5555-5555-555555555507	data_moi	follow	Tư vấn tại văn phòng	44444444-4444-4444-4444-444444444444	2026-09-19 05:07:09.706+00
7a25a4be-5901-4d39-abc7-e302ffa67407	55555555-5555-5555-5555-555555555507	follow	da_dang_ky	Hoàn tất đóng học phí tại quầy	44444444-4444-4444-4444-444444444444	2026-09-25 05:07:09.706+00
160734e8-4de2-4d9d-9842-97c8a411abdc	55555555-5555-5555-5555-555555555507	da_dang_ky	dang_hoc	Khai giảng lớp K24-ELEC-A	44444444-4444-4444-4444-444444444444	2026-09-27 05:07:09.706+00
65d6ac99-ad97-49bf-bb75-51c34e00feb9	55555555-5555-5555-5555-555555555508	data_moi	follow	Tư vấn ban đầu	44444444-4444-4444-4444-444444444445	2026-10-01 05:07:09.706+00
2a709efd-2b43-4be2-8c5b-b714060b719a	55555555-5555-5555-5555-555555555508	follow	tu_choi	Khách chuyển công tác vào miền Nam	44444444-4444-4444-4444-444444444445	2026-10-02 05:07:09.706+00
19ff4834-c58e-403a-a7a7-b21c592bfeb3	55555555-5555-5555-5555-555555555513	data_moi	follow	Gửi báo giá doanh nghiệp	44444444-4444-4444-4444-444444444445	2026-10-03 05:07:09.706+00
673de2ad-de07-452a-99c3-939d3e50af27	55555555-5555-5555-5555-555555555513	follow	da_dang_ky	Gara duyệt chi ngân sách cử thợ đi học	44444444-4444-4444-4444-444444444445	2026-10-05 05:07:09.706+00
788e98b2-b262-4dc6-8dbf-6b02c8df0699	55555555-5555-5555-5555-555555555514	data_moi	follow	Tư vấn Zalo	44444444-4444-4444-4444-444444444445	2026-09-09 05:07:09.706+00
0b585499-1119-4683-ab19-ff6d8dfc363d	55555555-5555-5555-5555-555555555514	follow	da_dang_ky	Chuyển khoản học phí	44444444-4444-4444-4444-444444444445	2026-09-14 05:07:09.706+00
5ad25552-970f-4ae2-ba83-87252eb35ef2	55555555-5555-5555-5555-555555555514	da_dang_ky	dang_hoc	Chuyển đổi sang học viên chính thức	44444444-4444-4444-4444-444444444445	2026-09-17 05:07:09.706+00
7e59f500-5ac9-47c1-8e5b-0a5662f16a68	55555555-5555-5555-5555-555555555519	data_moi	follow	Tư vấn qua Zalo	44444444-4444-4444-4444-444444444446	2026-10-04 05:07:09.706+00
e78dd177-20af-40c6-9e0a-916650b9e3ec	55555555-5555-5555-5555-555555555519	follow	da_dang_ky	Khách chuyển khoản đủ học phí khóa EV	44444444-4444-4444-4444-444444444446	2026-10-06 05:07:09.706+00
6dcc3c38-089f-4ec6-babf-cef939c9f992	55555555-5555-5555-5555-555555555515	data_moi	tu_choi	Chuyển trạng thái sang tu_choi	44444444-4444-4444-4444-444444444446	2026-10-07 06:20:43.840521+00
85608cbf-45af-4ed9-8c87-56b12328d8e8	55555555-5555-5555-5555-555555555503	goi_lai_sau	da_dang_ky	1-Click Chuyển đổi thành Học viên	11111111-1111-1111-1111-111111111111	2026-10-07 08:42:49.566173+00
87914cba-a9e2-4c60-9614-da7a037ef84a	31420e2d-cfd1-4fb7-b5eb-e8070c7fcb3c	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:11:18.938871+00
d55a0775-a4af-4049-b88e-46edc71bc533	def9b747-a6ba-44fa-80f4-480beb45a026	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:11:19.521322+00
f8299cb6-12e8-438a-8ce9-8faf50c46463	bfa3f020-816c-4012-979c-7a34cd71b2e1	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:11:34.773585+00
72cd6ac2-408c-4828-bb35-8cb067734ced	9b81cb72-658c-4bc9-877f-cc2d551b7958	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:17:35.451015+00
3f454a81-95b6-4796-a6a5-a37640522818	810d8f15-7012-4574-b06c-96f6b0b689eb	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:17:36.074928+00
0f56bdfc-ecb1-47b8-96e3-6a6f04ebca99	ad75f028-42bb-4019-87fb-fab9b7334758	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:40:51.634288+00
a2dc2d3c-7f07-4f44-98e2-89c94521d9bf	e469c866-05c3-44c4-bf9b-79b8685bd66c	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:40:52.280338+00
6e7e0f60-85e3-422a-b1b2-c7fc57e91a25	e175ff64-3196-4902-90a0-6e888c9a1adf	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:40:52.913897+00
c9e0ef31-ac19-4c63-9cc1-ced41c7c18fd	60a1f641-4078-49ec-80f2-c719e353faf5	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:45:11.949505+00
4bcd1ad6-7f83-4636-a608-422131725e6c	29f90334-81ed-4a1c-823b-7f4bda771b1b	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:45:12.532909+00
1ba65551-7de6-4ef8-b51c-d794ad5686ab	e755645d-f430-4fa4-9446-9bad6550fcf5	\N	data_moi	Tiếp nhận Lead mới	44444444-4444-4444-4444-444444444440	2026-10-07 09:45:13.10752+00
addef56e-df0f-4dfd-8490-45fd15ad1349	e175ff64-3196-4902-90a0-6e888c9a1adf	data_moi	goi_lai_sau	Chuyển trạng thái sang goi_lai_sau	44444444-4444-4444-4444-444444444440	2026-10-16 08:31:33.481871+00
cc4e9bfd-6922-42b7-b28c-d29858883330	e755645d-f430-4fa4-9446-9bad6550fcf5	data_moi	da_dang_ky	Chốt học viên thành công	44444444-4444-4444-4444-444444444440	2026-10-19 04:28:30.004164+00
0a1a49d7-01b7-4fa0-9f94-958ed970cf10	55555555-5555-5555-5555-555555555516	follow	da_dang_ky	Chốt học viên thành công	44444444-4444-4444-4444-444444444446	2026-10-20 01:44:07.844309+00
619a8a91-48dd-453b-965a-aac4927f7407	29f90334-81ed-4a1c-823b-7f4bda771b1b	data_moi	da_dang_ky	1-Click Chuyển đổi thành Học viên	44444444-4444-4444-4444-444444444445	2026-10-21 03:42:03.751931+00
\.


--
-- Data for Name: lead_tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lead_tasks (id, lead_id, assigned_to, title, description, due_at, completed_at, created_by, created_at, updated_at) FROM stdin;
e2d84c91-0510-4b6b-9820-9262c4cace9f	55555555-5555-5555-5555-555555555515	44444444-4444-4444-4444-444444444446	Gọi điện tư vấn khách Võ Văn Kiệt	Khách để lại thông tin từ livestream TikTok, cần gọi sớm trước khi nguội lead	2026-10-07 03:07:09.706+00	\N	44444444-4444-4444-4444-444444444446	2026-10-07 00:07:09.706+00	2026-10-07 05:07:09.706+00
bc02121a-fd52-4f93-8be2-fbb8f7013419	55555555-5555-5555-5555-555555555505	44444444-4444-4444-4444-444444444445	Gọi lại cho khách Vũ Đình Trọng	Hôm qua không nhấc máy, cần thử lại vào đầu giờ sáng	2026-10-07 01:07:09.706+00	\N	44444444-4444-4444-4444-444444444445	2026-10-06 05:07:09.706+00	2026-10-07 05:07:09.706+00
9bcbcb0d-66f5-416d-a027-27fe2f6324d3	55555555-5555-5555-5555-555555555501	44444444-4444-4444-4444-444444444444	Gọi điện tư vấn lộ trình và xếp lớp cho anh Hùng	Khách có nhu cầu học ngay trong tháng 10 này	2026-10-07 08:07:09.706+00	\N	44444444-4444-4444-4444-444444444444	2026-10-07 03:07:09.706+00	2026-10-07 05:07:09.706+00
9567b2fb-a5e0-47f6-b4d3-4460cc325e8e	55555555-5555-5555-5555-555555555503	44444444-4444-4444-4444-444444444445	Gọi lại sau giờ tan ca cho anh Long	Khách hẹn sau 17h30 chiều nay gọi lại	2026-10-07 10:07:09.706+00	\N	44444444-4444-4444-4444-444444444445	2026-10-06 05:07:09.706+00	2026-10-07 05:07:09.706+00
76e67c71-c69c-4d7c-8564-4eb882b5ef00	55555555-5555-5555-5555-555555555502	44444444-4444-4444-4444-444444444444	Nhắn tin Zalo nhắc chị Mai về ưu đãi đóng sớm	Hạn chót ưu đãi giảm 1.5 triệu là cuối tuần này	2026-10-08 05:07:09.706+00	\N	44444444-4444-4444-4444-444444444444	2026-10-06 05:07:09.706+00	2026-10-07 05:07:09.706+00
0c4e51cf-c95c-4580-9869-c3302f288f9f	55555555-5555-5555-5555-555555555504	44444444-4444-4444-4444-444444444444	Chuẩn bị phòng tiếp đón anh Dũng và bạn sang xưởng	Hẹn sang cơ sở xem phòng thực hành lúc 14h thứ 7	2026-10-09 05:07:09.706+00	\N	44444444-4444-4444-4444-444444444444	2026-10-04 05:07:09.706+00	2026-10-07 05:07:09.706+00
812b90c3-bbcc-4b1c-bc8b-9e3ff219c4f0	55555555-5555-5555-5555-555555555512	44444444-4444-4444-4444-444444444446	Gửi thời khóa biểu lớp K24-ENG-B cho anh Đức	Kèm danh sách các thiết bị máy đọc lỗi thực hành	2026-10-08 05:07:09.706+00	\N	44444444-4444-4444-4444-444444444446	2026-10-05 05:07:09.706+00	2026-10-07 05:07:09.706+00
eb276d65-1d82-4aca-8f73-993847559418	55555555-5555-5555-5555-555555555516	44444444-4444-4444-4444-444444444446	Nhắc anh Phong nộp ảnh thẻ và CCCD hoàn thiện hồ sơ	Hạn chót hoàn tất hồ sơ trước ngày khai giảng 3 ngày	2026-10-10 05:07:09.706+00	\N	44444444-4444-4444-4444-444444444446	2026-10-06 05:07:09.706+00	2026-10-07 05:07:09.706+00
15f80fb6-fbc3-4ac1-9f5b-d8bfe51bb21d	55555555-5555-5555-5555-555555555518	44444444-4444-4444-4444-444444444444	Hẹn gọi lại sau kỳ thi đại học cho Nam	Theo dõi và liên hệ lại sau khi kết thúc môn thi	2026-10-12 05:07:09.706+00	\N	44444444-4444-4444-4444-444444444444	2026-10-06 05:07:09.706+00	2026-10-07 05:07:09.706+00
c13936a2-87de-4df8-9765-0a6497a419b9	55555555-5555-5555-5555-555555555506	44444444-4444-4444-4444-444444444444	Gửi số tài khoản ngân hàng trung tâm	Đã gửi qua Zalo và SMS cho anh Tuấn	2026-10-06 05:07:09.706+00	2026-10-06 05:07:09.706+00	44444444-4444-4444-4444-444444444444	2026-10-05 05:07:09.706+00	2026-10-07 05:07:09.706+00
243e3c0e-4727-41db-8f38-5bb153c768df	55555555-5555-5555-5555-555555555507	44444444-4444-4444-4444-444444444444	Lập phiếu thu và tạo hồ sơ nhập học	Đã cấp mã học viên và bàn giao cho khối đào tạo	2026-09-27 05:07:09.706+00	2026-09-27 05:07:09.706+00	44444444-4444-4444-4444-444444444444	2026-09-25 05:07:09.706+00	2026-10-07 05:07:09.706+00
9cf2890a-d6f7-44d2-81ee-d961c25e5fdc	55555555-5555-5555-5555-555555555519	44444444-4444-4444-4444-444444444446	Xác nhận chuyển khoản và gửi thư mời nhập học	Đã kiểm tra biến động số dư và gửi email xác nhận	2026-10-06 05:07:09.706+00	2026-10-06 05:07:09.706+00	44444444-4444-4444-4444-444444444446	2026-10-05 05:07:09.706+00	2026-10-07 05:07:09.706+00
\.


--
-- Data for Name: leads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.leads (id, full_name, phone, email, date_of_birth, gender, address, source, source_detail, utm_source, utm_medium, utm_campaign, utm_content, utm_term, interested_course_id, notes, pipeline_status, assigned_to, assigned_at, assigned_by, converted_student_id, converted_at, converted_by, created_by, created_at, updated_at, deleted_at) FROM stdin;
55555555-5555-5555-5555-555555555501	Nguyễn Văn Hùng	0912345678	hung.nv@gmail.com	1998-05-14	male	Quận Cầu Giấy, Hà Nội	facebook	Quảng cáo Facebook Ads	facebook	\N	dien_oto_t10	\N	\N	20000000-0000-0000-0000-000000000001	\N	data_moi	44444444-4444-4444-4444-444444444444	2026-10-07 03:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 02:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555504	Phạm Quốc Dũng	0934567890	dung.pq@garaoto.vn	1992-03-25	male	Quận Nam Từ Liêm, Hà Nội	referral	Gara Thành Phát giới thiệu thợ chính đi học	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	\N	follow	44444444-4444-4444-4444-444444444444	2026-10-03 05:07:09.706+00	11111111-1111-1111-1111-111111111111	\N	\N	\N	44444444-4444-4444-4444-444444444444	2026-10-02 05:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555505	Vũ Đình Trọng	0971234567	trong.vd@gmail.com	2000-12-01	male	Huyện Đông Anh, Hà Nội	tiktok	Kênh TikTok kỹ thuật xe NSA	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	\N	knm_thue_bao	44444444-4444-4444-4444-444444444445	2026-10-06 05:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444445	2026-10-05 05:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555502	Trần Thị Mai	0987654321	mai.tran@gmail.com	1995-11-20	female	Quận Đống Đa, Hà Nội	zalo	Khách quét QR Zalo tại triển lãm AutoTech	zalo_oa	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	\N	follow	44444444-4444-4444-4444-444444444444	2026-10-05 05:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444444	2026-10-04 05:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555503	Lê Hoàng Long	0903332211	long.lh@gmail.com	2001-08-09	male	Thị xã Sơn Tây, Hà Nội	website	Form đăng ký tư vấn website	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000002	\N	da_dang_ky	44444444-4444-4444-4444-444444444445	2026-10-06 05:07:09.706+00	44444444-4444-4444-4444-444444444440	5fe4edef-3498-46fe-a735-2d3fd7dad19e	2026-10-07 08:42:51.879136+00	11111111-1111-1111-1111-111111111111	44444444-4444-4444-4444-444444444440	2026-10-06 05:07:09.706+00	2026-10-07 08:42:49.566173+00	\N
55555555-5555-5555-5555-555555555507	Đỗ Gia Huy	0945678123	huy.dg@gmail.com	1999-04-12	male	Quận Ba Đình, Hà Nội	walk_in	Đến tham quan trực tiếp xưởng thực hành	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	\N	dang_hoc	44444444-4444-4444-4444-444444444444	2026-09-22 05:07:09.706+00	44444444-4444-4444-4444-444444444440	fc4b6416-ee74-492e-a13f-1897064a779a	2026-09-27 05:07:09.706+00	44444444-4444-4444-4444-444444444444	44444444-4444-4444-4444-444444444444	2026-09-17 05:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555508	Bùi Anh Quân	0918765432	quan.ba@gmail.com	1996-09-30	male	Quận Hoàng Mai, Hà Nội	facebook	Lead Form Facebook Ads	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000002	\N	tu_choi	44444444-4444-4444-4444-444444444445	2026-10-01 05:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444445	2026-09-30 05:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555509	Dương Văn Quyết	0982223344	quyet.dv@gmail.com	1998-02-14	male	Quận Hà Đông, Hà Nội	website	Landing Page Khóa Điện Ô Tô K24	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	\N	data_moi	\N	\N	\N	\N	\N	\N	11111111-1111-1111-1111-111111111111	2026-10-07 04:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555510	Trịnh Khắc Cường	0904445566	cuong.tk@gmail.com	2002-06-22	male	Huyện Gia Lâm, Hà Nội	tiktok	TikTok Video review công nghệ chẩn đoán CAN	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	\N	data_moi	\N	\N	\N	\N	\N	\N	11111111-1111-1111-1111-111111111111	2026-10-07 04:37:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555511	Ngô Quang Hải	0977889900	hai.nq@gmail.com	1994-10-10	male	Quận Long Biên, Hà Nội	event	Workshop Công Nghệ Xe Điện NSA 2026	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	\N	data_moi	\N	\N	\N	\N	\N	\N	11111111-1111-1111-1111-111111111111	2026-10-07 01:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555512	Phan Văn Đức	0933112233	duc.pv@gmail.com	1993-01-17	male	Quận Tây Hồ, Hà Nội	google	Google Search: khóa học phun xăng điện tử GDI	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000002	\N	follow	44444444-4444-4444-4444-444444444446	2026-10-04 05:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444446	2026-10-03 05:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555514	Đặng Tiến Dũng	0989112244	dung.dt@gmail.com	1997-08-30	male	Quận Cầu Giấy, Hà Nội	zalo	Zalo Mini App đăng ký tư vấn	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000002	\N	dang_hoc	44444444-4444-4444-4444-444444444445	2026-09-12 05:07:09.706+00	44444444-4444-4444-4444-444444444440	98a56a05-dbf9-477b-a3d4-7d200140f1db	2026-09-17 05:07:09.706+00	44444444-4444-4444-4444-444444444445	44444444-4444-4444-4444-444444444445	2026-09-07 05:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555517	Nguyễn Hải Đăng	0976554433	dang.nh@gmail.com	1999-11-11	male	Quận Hai Bà Trưng, Hà Nội	walk_in	Ghé văn phòng trung tâm nhận brochure	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000002	\N	data_moi	\N	\N	\N	\N	\N	\N	11111111-1111-1111-1111-111111111111	2026-10-07 00:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555518	Trần Bảo Nam	0913998877	nam.tb@gmail.com	2003-09-02	male	Quận Đống Đa, Hà Nội	facebook	Quảng cáo Facebook	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	\N	goi_lai_sau	44444444-4444-4444-4444-444444444444	2026-10-06 05:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444444	2026-10-05 05:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555520	Chu Minh Trí	0984443322	tri.cm@gmail.com	1994-04-04	male	Quận Ba Đình, Hà Nội	other	Đối tác đào tạo cơ quan	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	\N	ket_thuc	44444444-4444-4444-4444-444444444445	2026-08-08 05:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444445	2026-08-03 05:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
55555555-5555-5555-5555-555555555515	Võ Văn Kiệt	0906778899	kiet.vv@gmail.com	2001-03-15	male	Quận Nam Từ Liêm, Hà Nội	facebook	Fanpage NSA post xe Hybrid	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	\N	tu_choi	44444444-4444-4444-4444-444444444446	2026-10-07 00:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444446	2026-10-06 23:07:09.706+00	2026-10-07 08:42:35.026849+00	\N
31420e2d-cfd1-4fb7-b5eb-e8070c7fcb3c	Trần Văn Minh	0909111222	minh.tran99@example.com	1999-01-01	male	Hà Nội	facebook	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	Quan tâm xe điện	data_moi	44444444-4444-4444-4444-444444444444	2026-10-07 09:11:20.281674+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 09:11:18.938871+00	2026-10-07 09:11:18.938871+00	\N
def9b747-a6ba-44fa-80f4-480beb45a026	Lê Thị Hoa	0909333444	hoa.le88@example.com	1988-05-12	female	TP.HCM	tiktok	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	Cần học tối	data_moi	44444444-4444-4444-4444-444444444445	2026-10-07 09:11:20.864408+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 09:11:19.521322+00	2026-10-07 09:11:19.521322+00	\N
bfa3f020-816c-4012-979c-7a34cd71b2e1	Nguyễn Thành Công	0909555666	ok.lead@example.com	2000-12-20	male	Đà Nẵng	zalo	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	Đúng nè	data_moi	44444444-4444-4444-4444-444444444444	2026-10-07 09:11:36.108645+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 09:11:34.773585+00	2026-10-07 09:11:34.773585+00	\N
9b81cb72-658c-4bc9-877f-cc2d551b7958	Phạm Quốc Đạt	0911888999	quocdat.pham@example.com	1997-08-15	male	Hà Nội	facebook	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	Khách cần tư vấn gấp học phí	data_moi	44444444-4444-4444-4444-444444444444	2026-10-07 09:17:36.768883+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 09:17:35.451015+00	2026-10-07 09:17:35.451015+00	\N
810d8f15-7012-4574-b06c-96f6b0b689eb	Hoàng Thu Trang	0933444555	thutrang.hoang@example.com	2000-11-22	female	Đà Nẵng	tiktok	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000002	Đăng ký ca tối	data_moi	44444444-4444-4444-4444-444444444445	2026-10-07 09:17:37.392891+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 09:17:36.074928+00	2026-10-07 09:17:36.074928+00	\N
ad75f028-42bb-4019-87fb-fab9b7334758	Trần Văn An	0901234567	tranvanan@example.com	1998-05-15	male	Hà Nội	facebook	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	Quan tâm khóa kỹ thuật xe điện & Hybrid	data_moi	44444444-4444-4444-4444-444444444444	2026-10-07 09:40:52.886987+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 09:40:51.634288+00	2026-10-07 09:40:51.634288+00	\N
60a1f641-4078-49ec-80f2-c719e353faf5	Trần Văn Băng	901234888	tranvanan@example.com	1998-05-15	male	Hà Nội	facebook	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	Quan tâm khóa kỹ thuật xe điện & Hybrid	data_moi	44444444-4444-4444-4444-444444444444	2026-10-07 09:45:13.200493+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 09:45:11.949505+00	2026-10-07 09:45:11.949505+00	\N
e175ff64-3196-4902-90a0-6e888c9a1adf	Lê Quốc Huy	0987654321	huy.le@example.com	1995-12-08	male	Đà Nẵng	zalo	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000002	Muốn bổ túc chẩn đoán động cơ GDI	goi_lai_sau	\N	\N	\N	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 09:40:52.913897+00	2026-10-16 08:31:33.481871+00	\N
55555555-5555-5555-5555-555555555506	Hoàng Minh Tuấn	0968889999	tuan.hm@gmail.com	1997-07-18	male	Quận Thanh Xuân, Hà Nội	google	Tìm kiếm Google: khóa học ô tô điện EV	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	\N	follow	44444444-4444-4444-4444-444444444444	2026-10-02 05:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444444	2026-10-01 05:07:09.706+00	2026-10-21 03:02:45.577049+00	\N
55555555-5555-5555-5555-555555555513	Lâm Thanh Sơn	0915667788	son.lt@gara-son.vn	1990-12-05	male	Quận Bắc Từ Liêm, Hà Nội	referral	Đối tác Gara Sơn Auto cử nhân viên đi học	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	\N	follow	44444444-4444-4444-4444-444444444445	2026-10-03 05:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444445	2026-10-02 05:07:09.706+00	2026-10-21 03:02:45.577049+00	\N
55555555-5555-5555-5555-555555555519	Hồ Công Lý	0908112255	ly.hc@gmail.com	1992-05-19	male	Quận Cầu Giấy, Hà Nội	tiktok	Livestream tư vấn xe điện	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000003	\N	follow	44444444-4444-4444-4444-444444444446	2026-10-05 05:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444446	2026-10-04 05:07:09.706+00	2026-10-21 03:02:45.577049+00	\N
e755645d-f430-4fa4-9446-9bad6550fcf5	Lê Quốc Khanh	0987654777	huy.le@example.com	1995-12-08	male	Đà Nẵng	zalo	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000002	Muốn bổ túc chẩn đoán động cơ GDI e	follow	\N	\N	\N	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 09:45:13.10752+00	2026-10-21 03:02:45.577049+00	\N
29f90334-81ed-4a1c-823b-7f4bda771b1b	Nguyễn Thị Hồng	0912345999	mainguyen@example.com	2001-10-20	female	TP. Hồ Chí Minh	tiktok	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	Tư vấn lịch học thực hành buổi tối	da_dang_ky	44444444-4444-4444-4444-444444444445	2026-10-07 09:45:13.783531+00	44444444-4444-4444-4444-444444444440	eb8b759a-d60d-4efa-a850-270d1e18ddc9	2026-10-21 03:42:04.057938+00	44444444-4444-4444-4444-444444444445	44444444-4444-4444-4444-444444444440	2026-10-07 09:45:12.532909+00	2026-10-21 03:42:03.751931+00	\N
55555555-5555-5555-5555-555555555516	Tạ Đình Phong	0943221100	phong.td@gmail.com	1995-07-22	male	Quận Thanh Xuân, Hà Nội	website	Website Form tư vấn nghề	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	\N	follow	44444444-4444-4444-4444-444444444446	2026-10-05 05:07:09.706+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444446	2026-10-04 05:07:09.706+00	2026-10-21 03:02:45.577049+00	\N
e469c866-05c3-44c4-bf9b-79b8685bd66c	Nguyễn Thị Mai	0912345678	mainguyen@example.com	2001-10-20	female	TP. Hồ Chí Minh	tiktok	\N	\N	\N	\N	\N	\N	20000000-0000-0000-0000-000000000001	Đã chốt học viên khóa mới (chưa tạo phiếu đăng ký)	follow	44444444-4444-4444-4444-444444444445	2026-10-07 09:40:53.533275+00	44444444-4444-4444-4444-444444444440	\N	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-07 09:40:52.280338+00	2026-10-21 03:02:45.577049+00	\N
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, title, message, type, status, action_url, read_at, created_at, updated_at) FROM stdin;
0696a6f9-4b00-4d11-a5b3-cd1ad57fd560	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-19 07:43:48.695589+00	2026-08-19 07:43:48.695589+00
bd5b9a4f-ba3c-4d39-abba-781f18674a97	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-19 07:43:48.695589+00	2026-08-19 07:43:48.695589+00
ab69dfe0-fca9-4061-a5f7-8a8d565bc14a	11111111-1111-1111-1111-111111111111	Chào mừng Quản trị viên	Chào mừng bạn đến với Hệ thống Quản lý Đào tạo Kỹ thuật Ô tô NSA Platform.	info	read	\N	2026-08-19 07:48:08.075836+00	2026-08-19 07:42:12.719914+00	2026-08-19 07:48:08.075836+00
22b474a6-c3c6-4ad6-bf09-f1ce5ac5d722	11111111-1111-1111-1111-111111111111	Báo cáo tuần mới	Đã tạo lịch học tuần hiện tại cho 3 lớp học K24.	system	read	\N	2026-08-19 07:48:09.600724+00	2026-08-19 07:42:12.719914+00	2026-08-19 07:48:09.600724+00
96663051-2d3b-4857-b997-96bbd59dc427	22222222-2222-2222-2222-222222222222	Lịch giảng dạy mới	Bạn có lịch dạy thực hành lớp K24-ELEC-A tại Xưởng XH-01.	schedule	read	\N	2026-08-19 08:49:02.366692+00	2026-08-19 07:42:12.719914+00	2026-08-19 08:49:02.366692+00
c862ac88-5006-4567-9b38-1566000c3801	22222222-2222-2222-2222-222222222222	Nhắc nhở điểm danh	Vui lòng hoàn tất điểm danh cho buổi học Mạng CAN Bus.	reminder	read	\N	2026-08-19 08:49:02.381063+00	2026-08-19 07:42:12.719914+00	2026-08-19 08:49:02.381063+00
88227e85-eff3-4288-b39d-d6024f9b044b	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 50.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-19 17:00:33.046157+00	2026-08-19 17:00:33.046157+00
6ae258a8-2b90-4b59-97b3-2dafa8af55dc	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-19 17:00:33.046157+00	2026-08-19 17:00:33.046157+00
5462731f-3720-4de2-9b55-d3e979294539	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 50.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-20 00:00:32.910616+00	2026-08-20 00:00:32.910616+00
ab02a813-21b2-40fc-ae57-806202bf2276	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-20 00:00:32.910616+00	2026-08-20 00:00:32.910616+00
abc4d295-b9e9-42ef-8818-2020c37784f6	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-20 00:00:32.910616+00	2026-08-20 00:00:32.910616+00
331ce5a5-e3d9-4b22-917a-49ff24faa78d	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-20 00:00:32.910616+00	2026-08-20 00:00:32.910616+00
25073f1d-aa21-4059-a37e-5f703d1a94fe	33333333-3333-3333-3333-333333333333	Điểm kiểm tra đã được cập nhật	Kiểm tra lý thuyết 2 · 7.50 điểm	test_score	read	/student/danh-gia	2026-08-20 09:17:36.075249+00	2026-08-20 06:46:18.001384+00	2026-08-20 09:17:36.075249+00
87f9e332-e220-4139-9df2-0d1f9a495458	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 50.00%.	attendance_risk	read	/student/diem-danh	2026-08-20 09:17:36.077012+00	2026-08-19 17:00:33.046157+00	2026-08-20 09:17:36.077012+00
1cfa54d1-ee93-4456-ab35-350191f1f342	33333333-3333-3333-3333-333333333333	Điểm kiểm tra đã được cập nhật	Kiểm tra lý thuyết 2 · 8.00 điểm	test_score	read	/student/danh-gia	2026-08-20 09:17:36.078293+00	2026-08-20 06:42:26.136869+00	2026-08-20 09:17:36.078293+00
46613a2d-af9a-4194-951a-b143053bc2e2	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 50.00%.	attendance_risk	read	/student/diem-danh	2026-08-20 09:17:36.078767+00	2026-08-20 00:00:32.910616+00	2026-08-20 09:17:36.078767+00
9303d1b6-654c-4148-883e-6b597a647632	33333333-3333-3333-3333-333333333333	Có kết quả kiểm tra mới	Kiểm tra lý thuyết 2 · 8.00 điểm	test_score	read	/student/danh-gia	2026-08-20 09:17:36.079028+00	2026-08-20 06:41:38.904596+00	2026-08-20 09:17:36.079028+00
0ff26872-901a-43bc-b0da-9306fda9211f	33333333-3333-3333-3333-333333333333	Điểm kiểm tra đã được cập nhật	Kiểm tra lý thuyết 2 · 9.00 điểm	test_score	read	/student/danh-gia	2026-08-20 09:17:36.079134+00	2026-08-20 06:42:10.784119+00	2026-08-20 09:17:36.079134+00
a9a2d653-b652-49da-83e7-9682096e1433	33333333-3333-3333-3333-333333333333	Điểm danh thành công	Giảng viên đã xác nhận điểm danh: Có mặt (100%) cho buổi học vừa qua.	info	read	\N	2026-08-20 09:17:36.267695+00	2026-08-19 07:42:12.719914+00	2026-08-20 09:17:36.267695+00
6bb4ceca-9fa2-4536-8ec2-7807d1d53e0b	33333333-3333-3333-3333-333333333333	Thời khóa biểu mới	Lịch học lớp Điện K24 tuần này đã được cập nhật. Xem chi tiết tại Lịch học.	schedule	read	\N	2026-08-20 09:17:36.267591+00	2026-08-19 07:42:12.719914+00	2026-08-20 09:17:36.267591+00
34389b98-809c-4cc6-b85d-be2124358c7b	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 50.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-21 03:01:15.953671+00	2026-08-21 03:01:15.953671+00
022230ad-c9d9-4bc0-b5c2-62449863e705	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 50.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-21 03:01:15.953671+00	2026-08-21 03:01:15.953671+00
77fa587b-fa37-4665-a79e-12d232b26aa4	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-21 03:01:15.953671+00	2026-08-21 03:01:15.953671+00
32787e6a-5c2c-4d35-bbea-97c701638216	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-21 03:01:15.953671+00	2026-08-21 03:01:15.953671+00
4aadcb08-5e02-4c1c-be86-f1c785962426	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-22 02:17:28.428732+00	2026-08-22 02:17:28.428732+00
fa59c9d8-5b12-4078-a18f-c9b3db5f9f35	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-22 02:17:28.428732+00	2026-08-22 02:17:28.428732+00
5976f8b4-8a68-4789-98fa-7feb11794d86	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-22 02:17:28.428732+00	2026-08-22 02:17:28.428732+00
d300d826-f817-4bd4-992a-4309c733af69	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-22 02:17:28.428732+00	2026-08-22 02:17:28.428732+00
7ac647de-4e15-435a-8386-0a589160d29f	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-22 02:17:28.428732+00	2026-08-22 02:17:28.428732+00
80d16790-81a3-4b3c-beab-ac79251569cb	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-23 00:00:28.73859+00	2026-08-23 00:00:28.73859+00
8ef763ef-e22d-4f1d-a55b-fc42f95602be	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-23 00:00:28.73859+00	2026-08-23 00:00:28.73859+00
a7fdff96-6930-409f-9ed7-b453a808524a	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-23 00:00:28.73859+00	2026-08-23 00:00:28.73859+00
e7934a10-edb8-4961-a50c-f19da519af88	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-23 00:00:28.73859+00	2026-08-23 00:00:28.73859+00
351fd5ce-65b6-42cd-8d4f-b2df685119d2	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-23 00:00:28.73859+00	2026-08-23 00:00:28.73859+00
1084ba20-5dc3-4031-97f0-c0124277e6fa	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-24 09:01:33.68381+00	2026-08-24 09:01:33.68381+00
48ccc2bf-4d6c-4b40-8c23-b04e3732ce6c	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-24 09:01:33.68381+00	2026-08-24 09:01:33.68381+00
59c51daf-0118-4090-880f-bcba6b30cf2d	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-24 09:01:33.68381+00	2026-08-24 09:01:33.68381+00
cc631552-b334-467a-bf32-6b8023ea3ae5	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-24 09:01:33.68381+00	2026-08-24 09:01:33.68381+00
cd753843-374a-4e51-ad67-cc53a7280bfb	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-08-24 09:01:33.68381+00	2026-08-24 09:01:33.68381+00
9f772140-f4cb-40eb-be97-bf331377e9a4	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-04 03:21:32.032415+00	2026-09-04 03:21:32.032415+00
e9872de3-cf66-4ff9-aea2-2a4d649e607c	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-04 03:21:32.032415+00	2026-09-04 03:21:32.032415+00
1369f0d7-a825-4cbf-8c3c-ccdd8ec03ee6	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-04 03:21:32.032415+00	2026-09-04 03:21:32.032415+00
72fb52ce-1e8b-486f-a177-5ff6d3ab6c82	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-04 03:21:32.032415+00	2026-09-04 03:21:32.032415+00
c3e779d8-e8ec-449b-a108-8c6b4e0a1027	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-04 03:21:32.032415+00	2026-09-04 03:21:32.032415+00
58a31d98-92a6-43a5-b394-6d54dc140a10	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-05 00:00:15.597075+00	2026-09-05 00:00:15.597075+00
0d01dcb8-881c-4154-aeba-30f0ffdc7987	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-05 00:00:15.597075+00	2026-09-05 00:00:15.597075+00
fb3c018b-612b-484a-b367-e9f5fc25cd3d	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-05 00:00:15.597075+00	2026-09-05 00:00:15.597075+00
19bfb96d-a5bc-4164-8bf0-ac4e1eef2424	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-05 00:00:15.597075+00	2026-09-05 00:00:15.597075+00
09af4ac7-d843-46b8-938b-1c89b9a9ffab	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-05 00:00:15.597075+00	2026-09-05 00:00:15.597075+00
53e07de9-84eb-47cd-accc-c9ac75e53758	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-06 00:00:15.595467+00	2026-09-06 00:00:15.595467+00
6074757c-8ddf-467a-a5e3-93378d0bf3c7	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-06 00:00:15.595467+00	2026-09-06 00:00:15.595467+00
5b8e5fa7-4b67-4932-8fb5-d9903458eb88	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-06 00:00:15.595467+00	2026-09-06 00:00:15.595467+00
da7daac1-5dbe-480a-bdc0-19799594470a	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-06 00:00:15.595467+00	2026-09-06 00:00:15.595467+00
fac346cc-e098-422e-9d95-e6194ca01f25	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-06 00:00:15.595467+00	2026-09-06 00:00:15.595467+00
788c5b90-12d2-4eaa-99bb-c3de5bc8ff04	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-07 00:00:15.587513+00	2026-09-07 00:00:15.587513+00
7c6c2486-b0fe-4adb-91b7-eb0b658aeeea	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-07 00:00:15.587513+00	2026-09-07 00:00:15.587513+00
f796fd51-87d2-4ffb-b3bd-11cafb6292fc	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-07 00:00:15.587513+00	2026-09-07 00:00:15.587513+00
7e7a7cf1-02b2-42c7-ba81-1ff3519943df	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-07 00:00:15.587513+00	2026-09-07 00:00:15.587513+00
d6f4cde7-e57d-4c58-aaf0-8e4d8ad1eceb	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-07 00:00:15.587513+00	2026-09-07 00:00:15.587513+00
a0617f71-3583-416a-bfeb-22b0365f754a	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-08 00:00:15.577129+00	2026-09-08 00:00:15.577129+00
b479cdd2-c576-4a13-9eee-99a14c691dca	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-08 00:00:15.577129+00	2026-09-08 00:00:15.577129+00
a7e3c145-830f-498b-b098-c0aca69a65bd	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-08 00:00:15.577129+00	2026-09-08 00:00:15.577129+00
58c1b920-0689-4cbe-9128-78d946dde29d	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-08 00:00:15.577129+00	2026-09-08 00:00:15.577129+00
6eb19a76-c7be-4059-99a7-d6dedf654a24	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-08 00:00:15.577129+00	2026-09-08 00:00:15.577129+00
525998da-92be-431e-be98-bfe706101a30	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-09 00:00:15.589565+00	2026-09-09 00:00:15.589565+00
b58b21f9-a465-4183-af03-29293d98dda2	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-09 00:00:15.589565+00	2026-09-09 00:00:15.589565+00
a78fe344-f852-4a33-a234-4ebabcdfb10d	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-09 00:00:15.589565+00	2026-09-09 00:00:15.589565+00
66e96f56-e2e8-4f71-ac39-9b8061ba119b	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-09 00:00:15.589565+00	2026-09-09 00:00:15.589565+00
cd5b3524-13ab-4a87-bf4d-9021e148aa24	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-09 00:00:15.589565+00	2026-09-09 00:00:15.589565+00
c0e9b57f-c42b-43b4-9fb1-97f6033046c0	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-10 00:00:15.597058+00	2026-09-10 00:00:15.597058+00
21c238c5-563e-4a18-9347-761ae57d8bf5	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-10 00:00:15.597058+00	2026-09-10 00:00:15.597058+00
7dcea347-8502-4d7e-aa5b-246335d0fa56	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-10 00:00:15.597058+00	2026-09-10 00:00:15.597058+00
c315e710-dbd5-443d-8268-5904ffa3cedd	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-10 00:00:15.597058+00	2026-09-10 00:00:15.597058+00
98e4211b-15e1-4129-a8fb-c1d7c281beb6	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-10 00:00:15.597058+00	2026-09-10 00:00:15.597058+00
3383f565-c05c-49df-b6eb-131d3bd731f8	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-11 00:00:15.575288+00	2026-09-11 00:00:15.575288+00
43054d55-a678-4d7f-ace4-b0b59d315b62	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-11 00:00:15.575288+00	2026-09-11 00:00:15.575288+00
46e91ea8-1d4a-48d1-827a-99f4d74bf907	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-11 00:00:15.575288+00	2026-09-11 00:00:15.575288+00
62b29463-210b-4d31-8b34-826bc910615f	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-11 00:00:15.575288+00	2026-09-11 00:00:15.575288+00
620eb6b3-b8c8-4c1f-aadf-d744e6c83fbf	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-11 00:00:15.575288+00	2026-09-11 00:00:15.575288+00
30fa0124-7edd-4297-b2fe-66e4e77a1d1d	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-12 00:00:15.581626+00	2026-09-12 00:00:15.581626+00
db883db4-7e11-44a0-abbc-46e1a15bb3d0	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-12 00:00:15.581626+00	2026-09-12 00:00:15.581626+00
7663e8a7-29e4-496d-926a-fcd4a18d4acc	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-12 00:00:15.581626+00	2026-09-12 00:00:15.581626+00
32e9c557-e849-420e-9b71-adef1c74847e	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-12 00:00:15.581626+00	2026-09-12 00:00:15.581626+00
3cd3fb37-728e-422c-89aa-ada8bf24e58c	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-12 00:00:15.581626+00	2026-09-12 00:00:15.581626+00
6f2557a7-c8ac-44a2-805f-691257d59f57	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-13 00:00:15.90532+00	2026-09-13 00:00:15.90532+00
c6a45ca4-95a5-4abb-81e4-0ffffa820eb6	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-13 00:00:15.90532+00	2026-09-13 00:00:15.90532+00
b87f2a30-3e6c-4ca1-ba58-438b06535906	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-13 00:00:15.90532+00	2026-09-13 00:00:15.90532+00
8fc72cab-c960-489d-a8f6-2ed0a818ef83	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-13 00:00:15.90532+00	2026-09-13 00:00:15.90532+00
542fc947-6fc7-471b-a6a6-26a089c6ea9f	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-13 00:00:15.90532+00	2026-09-13 00:00:15.90532+00
136d11a2-f90b-4667-821f-0cca3b858202	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-14 00:00:15.587401+00	2026-09-14 00:00:15.587401+00
7bdfc084-fd46-4b18-83fc-a2bb12b07d58	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-14 00:00:15.587401+00	2026-09-14 00:00:15.587401+00
989defd8-eaaf-495f-81dd-ac07e45e21c7	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-14 00:00:15.587401+00	2026-09-14 00:00:15.587401+00
6622ec23-b8d2-4bfe-a413-9a9827c18e7f	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-14 00:00:15.587401+00	2026-09-14 00:00:15.587401+00
e1840260-0c3e-4d96-bd1a-1e9a1a814458	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-14 00:00:15.587401+00	2026-09-14 00:00:15.587401+00
d3afe340-21b1-4393-b14d-aabd88cfe510	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-15 00:00:15.587879+00	2026-09-15 00:00:15.587879+00
f6d283b0-f6ad-48c2-b1f2-6b0f95ffde81	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-15 00:00:15.587879+00	2026-09-15 00:00:15.587879+00
01b9ff31-2d41-46a5-a467-98817eecac63	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-15 00:00:15.587879+00	2026-09-15 00:00:15.587879+00
59469e57-e885-44e2-96ce-0054f3061ede	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-15 00:00:15.587879+00	2026-09-15 00:00:15.587879+00
63228d4f-44e2-4079-b1c3-285d8663d8fa	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-15 00:00:15.587879+00	2026-09-15 00:00:15.587879+00
1f839736-27fa-49e1-9155-6f95a1b4a0b0	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-16 00:00:15.576545+00	2026-09-16 00:00:15.576545+00
2730beb9-48c5-4115-a3ef-624d2f9712f7	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-16 00:00:15.576545+00	2026-09-16 00:00:15.576545+00
f437722c-ae99-45d7-b466-c42b89ac0daf	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-16 00:00:15.576545+00	2026-09-16 00:00:15.576545+00
b3983280-944f-43db-b97b-c4e76a97d722	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-16 00:00:15.576545+00	2026-09-16 00:00:15.576545+00
a1d04e62-a3c6-4216-8712-9d32d145b82b	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-16 00:00:15.576545+00	2026-09-16 00:00:15.576545+00
a434158d-cdfc-4ebb-8b9f-c4f7e89a3fe9	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-17 00:00:15.5852+00	2026-09-17 00:00:15.5852+00
dbef746b-49e8-4457-ae80-7a2f5a74ce3f	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-17 00:00:15.5852+00	2026-09-17 00:00:15.5852+00
a0c23c0b-1edf-4d9a-bd95-306fc0767396	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-17 00:00:15.5852+00	2026-09-17 00:00:15.5852+00
6c86b4ca-ee56-4e33-9109-10da96037cfa	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-17 00:00:15.5852+00	2026-09-17 00:00:15.5852+00
e3eba7d2-044c-4deb-9daf-b3755840dce5	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-17 00:00:15.5852+00	2026-09-17 00:00:15.5852+00
680ec6ef-2892-4626-9400-c9b3e050df45	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-18 00:00:15.58007+00	2026-09-18 00:00:15.58007+00
a976a71d-5ee7-4be3-acdf-43160e4fb9ed	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-18 00:00:15.58007+00	2026-09-18 00:00:15.58007+00
e909de84-0b08-4f2e-b18c-6f5a8298cea8	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-18 00:00:15.58007+00	2026-09-18 00:00:15.58007+00
98523181-b616-4005-88e9-49b2ed43c451	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-18 00:00:15.58007+00	2026-09-18 00:00:15.58007+00
8bc45f25-d930-4946-98e8-b8788d117876	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-18 00:00:15.58007+00	2026-09-18 00:00:15.58007+00
7ba6a0af-7685-4a32-aa5b-16a798f0a21d	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-19 00:00:15.598862+00	2026-09-19 00:00:15.598862+00
085f1123-e20f-42dc-a235-51bd134b68ea	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-19 00:00:15.598862+00	2026-09-19 00:00:15.598862+00
1c256247-63f1-49df-b1f5-674362c97681	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-19 00:00:15.598862+00	2026-09-19 00:00:15.598862+00
3bb343f9-91e9-4cd8-89a9-9c8d946546c5	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-19 00:00:15.598862+00	2026-09-19 00:00:15.598862+00
18e9ca34-a5e8-4789-b6ee-e6064bcd5470	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-19 00:00:15.598862+00	2026-09-19 00:00:15.598862+00
212b2057-7cff-4fba-8ef5-d4c0a60003c2	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-20 00:00:15.588037+00	2026-09-20 00:00:15.588037+00
3dddf607-c4bb-403c-8f56-2d3fd3744758	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-20 00:00:15.588037+00	2026-09-20 00:00:15.588037+00
f4ee526f-9547-4563-8265-8638db09ed47	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-20 00:00:15.588037+00	2026-09-20 00:00:15.588037+00
d99e7b07-1ab4-4f0b-bf5f-15116c71bcfe	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-20 00:00:15.588037+00	2026-09-20 00:00:15.588037+00
7a5e775e-80d1-44ea-a0e9-c4797a29af6c	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-20 00:00:15.588037+00	2026-09-20 00:00:15.588037+00
ab235c82-520b-4fed-a05c-19c922857cd2	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-21 00:00:15.606122+00	2026-09-21 00:00:15.606122+00
24b78744-a4cd-4e04-8839-876b2a05b1c7	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-21 00:00:15.606122+00	2026-09-21 00:00:15.606122+00
a0c8f0da-23fc-466a-a91b-2646f580c5d4	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-21 00:00:15.606122+00	2026-09-21 00:00:15.606122+00
81b69237-d1c1-4acd-8e6b-b69a89a70d9e	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-21 00:00:15.606122+00	2026-09-21 00:00:15.606122+00
394ab8cd-bbd8-4598-a0b8-342653c5e606	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-21 00:00:15.606122+00	2026-09-21 00:00:15.606122+00
7c6de2df-a4ad-4754-b21e-4580d1659676	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-22 00:00:15.579858+00	2026-09-22 00:00:15.579858+00
aec71e66-befd-4776-9d2d-cda0c8a391e2	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-22 00:00:15.579858+00	2026-09-22 00:00:15.579858+00
63d875d1-6106-4158-ab43-75323a574841	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-22 00:00:15.579858+00	2026-09-22 00:00:15.579858+00
690ef61d-ebeb-4684-a6df-366232841a2c	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-22 00:00:15.579858+00	2026-09-22 00:00:15.579858+00
1a13b0f5-1aab-40fd-ba2e-3b1915255320	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-22 00:00:15.579858+00	2026-09-22 00:00:15.579858+00
ddb7c93b-b3fb-4009-b5bd-7e580e6d83b7	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-23 00:00:15.589131+00	2026-09-23 00:00:15.589131+00
ce6e27c3-4958-449a-8a65-6658087f8d95	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-23 00:00:15.589131+00	2026-09-23 00:00:15.589131+00
b75b6815-3035-4b60-80de-79b2a4549468	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-23 00:00:15.589131+00	2026-09-23 00:00:15.589131+00
ebb940a9-4c38-454a-b57a-1d4812903b2d	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-23 00:00:15.589131+00	2026-09-23 00:00:15.589131+00
49d87f46-5f5a-47a9-90fc-0960c169bb06	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-23 00:00:15.589131+00	2026-09-23 00:00:15.589131+00
ba2d001f-015e-4a7e-81a5-1ce16ce6286d	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-24 00:00:15.620397+00	2026-09-24 00:00:15.620397+00
5c703142-792d-4472-b5eb-6968aa6e4d33	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-24 00:00:15.620397+00	2026-09-24 00:00:15.620397+00
8e25d25c-1117-4485-bf18-0fed2b271226	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-24 00:00:15.620397+00	2026-09-24 00:00:15.620397+00
82a99b32-2872-455f-a7d2-c47af3b61da9	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-24 00:00:15.620397+00	2026-09-24 00:00:15.620397+00
23f19398-c76c-41ad-a06f-a7203772382c	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-24 00:00:15.620397+00	2026-09-24 00:00:15.620397+00
e07e6cad-5ddf-4f17-b3d4-4429cb8ff43c	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-25 00:00:15.588333+00	2026-09-25 00:00:15.588333+00
1049e5a1-a4a7-4bb8-967b-4bf2bc22e716	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-25 00:00:15.588333+00	2026-09-25 00:00:15.588333+00
60fa0f5f-5373-4382-a5de-544b9566cbc7	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-25 00:00:15.588333+00	2026-09-25 00:00:15.588333+00
51838876-accd-445d-95b5-4468b2d2eb47	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-25 00:00:15.588333+00	2026-09-25 00:00:15.588333+00
3191822e-c797-40bd-b375-57b02c23b8c8	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-25 00:00:15.588333+00	2026-09-25 00:00:15.588333+00
3c3f380e-a301-4ce6-9134-86c0151bd4f0	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-26 00:00:15.579601+00	2026-09-26 00:00:15.579601+00
b6eee091-6fd2-4708-9b8f-3ba818c1da90	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-26 00:00:15.579601+00	2026-09-26 00:00:15.579601+00
bc69624b-76c8-4d6c-af99-d769edd7f945	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-26 00:00:15.579601+00	2026-09-26 00:00:15.579601+00
52734441-effa-4af3-801b-25aa7f0c36bc	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-26 00:00:15.579601+00	2026-09-26 00:00:15.579601+00
78d237b5-ab36-4daf-8813-22da0be3b803	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-26 00:00:15.579601+00	2026-09-26 00:00:15.579601+00
124b1997-8526-4873-a247-40dfb31d44c5	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-27 00:00:15.616007+00	2026-09-27 00:00:15.616007+00
5789e09a-3299-4032-831a-76c10fe816da	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-27 00:00:15.616007+00	2026-09-27 00:00:15.616007+00
04c08ae1-e549-4dd4-9fa4-39efacfc5c79	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-27 00:00:15.616007+00	2026-09-27 00:00:15.616007+00
2866de1e-54ad-4446-8dff-b331a578daee	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-27 00:00:15.616007+00	2026-09-27 00:00:15.616007+00
c81a2069-ce69-4c29-a45e-c9eb98f3ba82	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-27 00:00:15.616007+00	2026-09-27 00:00:15.616007+00
601857a2-295b-43ab-a938-1905f3a2e58f	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-28 00:00:15.576864+00	2026-09-28 00:00:15.576864+00
3b329984-3df8-4743-9020-a45d28f21fee	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-28 00:00:15.576864+00	2026-09-28 00:00:15.576864+00
3de2f0b4-bb90-4d81-9bdf-27ce28419239	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-28 00:00:15.576864+00	2026-09-28 00:00:15.576864+00
7009cb72-687c-4402-b8b6-285a7db25345	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-28 00:00:15.576864+00	2026-09-28 00:00:15.576864+00
cbc8d2c8-a847-4570-a9f6-a5a5ca046631	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-28 00:00:15.576864+00	2026-09-28 00:00:15.576864+00
06557c56-9e9c-4a8f-af0f-56f07abd5b04	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-29 00:00:15.590263+00	2026-09-29 00:00:15.590263+00
886f17be-8458-45e6-89c7-605d88ed831a	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-29 00:00:15.590263+00	2026-09-29 00:00:15.590263+00
138a4b6d-a185-4eda-b49e-70499fb557dd	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-29 00:00:15.590263+00	2026-09-29 00:00:15.590263+00
d43c0fd0-db27-41fa-87bf-fd85295dceb3	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-29 00:00:15.590263+00	2026-09-29 00:00:15.590263+00
a12ae4e9-ec69-4d9e-bd85-771d94cc23d7	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-29 00:00:15.590263+00	2026-09-29 00:00:15.590263+00
7a8e1c9a-05da-4926-abdd-abebae8acec0	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-30 00:00:15.57655+00	2026-09-30 00:00:15.57655+00
81639c59-42df-4dda-9c3d-6f9d8cedcb05	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-30 00:00:15.57655+00	2026-09-30 00:00:15.57655+00
0f185a2a-e948-4c9f-9067-1dfa00c74f78	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-30 00:00:15.57655+00	2026-09-30 00:00:15.57655+00
ab79b243-d7c1-4165-ac17-4d8c35110ed6	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-30 00:00:15.57655+00	2026-09-30 00:00:15.57655+00
410a131f-e41d-4d03-8e5f-57e9813cf1d3	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-09-30 00:00:15.57655+00	2026-09-30 00:00:15.57655+00
ef6b1e47-d29c-4c33-a3a2-d3e940043de7	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-01 00:00:15.587348+00	2026-10-01 00:00:15.587348+00
9767f730-2368-4202-8450-0a394e9eee9e	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-01 00:00:15.587348+00	2026-10-01 00:00:15.587348+00
1aa3e93c-fd5c-4842-9250-fdd41f2f7ad5	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-01 00:00:15.587348+00	2026-10-01 00:00:15.587348+00
cca1053e-8ac2-4d32-8374-68eb9c3fd92b	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-01 00:00:15.587348+00	2026-10-01 00:00:15.587348+00
9c503c3b-7af9-4ea1-8015-4225cfdf0e67	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-01 00:00:15.587348+00	2026-10-01 00:00:15.587348+00
dbc0f8e4-f320-4f8d-9eb3-4c1850cdb20e	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-02 00:00:15.578865+00	2026-10-02 00:00:15.578865+00
ad75ed93-3b35-48ee-9e7c-f6b3843f629a	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-02 00:00:15.578865+00	2026-10-02 00:00:15.578865+00
2a3f06f7-22a8-47a2-a0f4-dac6a6ae974e	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-02 00:00:15.578865+00	2026-10-02 00:00:15.578865+00
b00a48bd-5246-470b-9e2c-fa0a29b832d7	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-02 00:00:15.578865+00	2026-10-02 00:00:15.578865+00
86c7a0d5-b80d-4b42-ba61-d90f00708f16	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-02 00:00:15.578865+00	2026-10-02 00:00:15.578865+00
9a747c9a-bbb2-48b9-8fab-250fba6a6799	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-03 00:00:15.584375+00	2026-10-03 00:00:15.584375+00
ddd7975c-b25d-40f3-ba49-64947c6717b1	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-03 00:00:15.584375+00	2026-10-03 00:00:15.584375+00
e6eba10c-5d62-4ea6-81e6-9e46b41a8838	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-03 00:00:15.584375+00	2026-10-03 00:00:15.584375+00
5eb5f57a-18c8-48fc-8ca1-2767749e03b2	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-03 00:00:15.584375+00	2026-10-03 00:00:15.584375+00
ce4bc5af-9ab9-42ee-9718-bad5d2c47683	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-03 00:00:15.584375+00	2026-10-03 00:00:15.584375+00
4f811560-66ef-4f42-9fec-a1446922a84c	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-04 00:00:15.584382+00	2026-10-04 00:00:15.584382+00
a284dc9c-c42b-4786-acf8-902cf3743dbd	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-04 00:00:15.584382+00	2026-10-04 00:00:15.584382+00
49a8f9eb-ac47-4a18-b9e5-0875a502e75b	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-04 00:00:15.584382+00	2026-10-04 00:00:15.584382+00
0de3e91f-ad58-4319-9abe-b4f30a53ba00	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-04 00:00:15.584382+00	2026-10-04 00:00:15.584382+00
75652741-ddde-456d-aaf4-2f0ef8060c3a	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-04 00:00:15.584382+00	2026-10-04 00:00:15.584382+00
1a470145-9909-4030-9db4-71d88c6c6e3f	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-05 00:00:15.583585+00	2026-10-05 00:00:15.583585+00
8deb4033-3e33-4f2e-bd14-de8a5189b4fc	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-05 00:00:15.583585+00	2026-10-05 00:00:15.583585+00
4e6ec0d1-b8ce-40cd-bd6a-4b1c33b74b03	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-05 00:00:15.583585+00	2026-10-05 00:00:15.583585+00
08d79fda-3c7a-42c7-b89c-fc5bb5c0fba4	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-05 00:00:15.583585+00	2026-10-05 00:00:15.583585+00
f16291fe-94f7-4d6b-8922-7ad9e4107f6c	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-05 00:00:15.583585+00	2026-10-05 00:00:15.583585+00
983d09ef-b871-4890-b4fb-4947c79fc438	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-06 00:00:15.585649+00	2026-10-06 00:00:15.585649+00
73810b16-82e0-4611-998f-e7b240cd127d	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-06 00:00:15.585649+00	2026-10-06 00:00:15.585649+00
e0125597-89d6-4b9b-bd0f-fe5c31529c56	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-06 00:00:15.585649+00	2026-10-06 00:00:15.585649+00
c7be6f96-3df7-4696-a8e0-ee39e0fd4f4b	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-06 00:00:15.585649+00	2026-10-06 00:00:15.585649+00
902a53c7-4f4d-4cd9-b3ab-b1522a58d5fb	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-06 00:00:15.585649+00	2026-10-06 00:00:15.585649+00
c82b7b7c-fbcb-4da0-9751-e41c252ef31b	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-07 00:00:15.578727+00	2026-10-07 00:00:15.578727+00
aef873c7-8770-428c-baa8-c50805b2d409	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-07 00:00:15.578727+00	2026-10-07 00:00:15.578727+00
2f59092c-a3a8-4caa-88db-787e05fb169a	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-07 00:00:15.578727+00	2026-10-07 00:00:15.578727+00
d9cb3363-563b-407c-aa56-ad314bbc92f5	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-07 00:00:15.578727+00	2026-10-07 00:00:15.578727+00
c92f9748-6d61-4a2c-9d54-39e12dee8049	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-07 00:00:15.578727+00	2026-10-07 00:00:15.578727+00
34e4d29d-e8e0-4742-947f-612711cc58a0	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-08 00:00:15.593732+00	2026-10-08 00:00:15.593732+00
b1938c42-66b7-45ca-88de-6170148d2ef9	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-08 00:00:15.593732+00	2026-10-08 00:00:15.593732+00
6e0cb715-b650-4376-8618-4aab219308ff	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-08 00:00:15.593732+00	2026-10-08 00:00:15.593732+00
7eadff87-41cf-4add-a7e3-0657d6229cf1	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-08 00:00:15.593732+00	2026-10-08 00:00:15.593732+00
0052a852-dc83-46d5-b66d-d743b6501f68	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-08 00:00:15.593732+00	2026-10-08 00:00:15.593732+00
d6d3a832-a44e-42a9-8fb0-916056ce5e5d	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-09 00:00:05.239842+00	2026-10-09 00:00:05.239842+00
2e813e26-3c33-450b-9031-ada55ca94cd9	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-09 00:00:05.239842+00	2026-10-09 00:00:05.239842+00
38068e75-e79d-4138-b361-d3cfd0311d2a	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-09 00:00:05.239842+00	2026-10-09 00:00:05.239842+00
7949fad9-e805-462f-baa4-48f707fb73da	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-09 00:00:05.239842+00	2026-10-09 00:00:05.239842+00
c6dcda42-e5c8-433d-b603-2e1ff709d1e0	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-09 00:00:05.239842+00	2026-10-09 00:00:05.239842+00
2e8a718c-8df3-415a-9cd4-45fcf8a4e834	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-10 00:00:33.825578+00	2026-10-10 00:00:33.825578+00
9b1f9751-6554-4fff-bc50-0f80bfe3ab28	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-10 00:00:33.825578+00	2026-10-10 00:00:33.825578+00
bbe0d5a9-ba36-4cab-9238-2c8b1158af63	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-10 00:00:33.825578+00	2026-10-10 00:00:33.825578+00
3942c180-fb18-426c-8211-02ea3415bcf8	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-10 00:00:33.825578+00	2026-10-10 00:00:33.825578+00
b434ee93-2cbf-4c0d-bf32-23eef35eb122	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-10 00:00:33.825578+00	2026-10-10 00:00:33.825578+00
e99fd6df-1d66-4be4-b5eb-73f93de2fb7b	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-11 00:00:33.513833+00	2026-10-11 00:00:33.513833+00
5948937c-6b68-43ac-a8f6-0d7efff356bb	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-11 00:00:33.513833+00	2026-10-11 00:00:33.513833+00
29974782-d877-4293-b53f-198b1738c0e0	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-11 00:00:33.513833+00	2026-10-11 00:00:33.513833+00
1a7f31c0-2f14-4d50-83a0-50bdf8833d66	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-11 00:00:33.513833+00	2026-10-11 00:00:33.513833+00
6fc95752-df77-4089-80c1-ba56e5deee3f	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-11 00:00:33.513833+00	2026-10-11 00:00:33.513833+00
fb8d4468-31d4-42e9-a50a-d7b68725cebd	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-12 00:00:33.512128+00	2026-10-12 00:00:33.512128+00
131f2d82-54e9-4f22-87db-f2c36db595bf	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-12 00:00:33.512128+00	2026-10-12 00:00:33.512128+00
2b49cfe5-795e-4380-bcef-c4a1375e6b32	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-12 00:00:33.512128+00	2026-10-12 00:00:33.512128+00
03254423-24c0-4e9b-8008-37b21166e174	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-12 00:00:33.512128+00	2026-10-12 00:00:33.512128+00
da9c400b-deae-4200-94d4-0a880d7577de	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-12 00:00:33.512128+00	2026-10-12 00:00:33.512128+00
d7f36ec7-3baa-474d-ab3c-fd88e5d757c6	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-13 00:00:33.524953+00	2026-10-13 00:00:33.524953+00
f21ef5e0-3893-4598-887b-c46a13ac28eb	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-13 00:00:33.524953+00	2026-10-13 00:00:33.524953+00
50b92bd4-959b-4a54-8431-55933de2eb97	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-13 00:00:33.524953+00	2026-10-13 00:00:33.524953+00
5cfd70a9-7c21-4a1f-97e5-b3d9ce5611a3	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-13 00:00:33.524953+00	2026-10-13 00:00:33.524953+00
77ad13b7-a3ea-44e8-ae1e-7d87cc8144df	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-13 00:00:33.524953+00	2026-10-13 00:00:33.524953+00
558feda3-df2f-4ffd-88c1-951190739b8c	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-14 00:00:33.516872+00	2026-10-14 00:00:33.516872+00
1232ccbb-75b4-492b-81eb-d5a761a5bbd6	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-14 00:00:33.516872+00	2026-10-14 00:00:33.516872+00
db2b9479-717f-42ae-82fd-262fe26000c9	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-14 00:00:33.516872+00	2026-10-14 00:00:33.516872+00
76c26d0b-aea8-415f-ad5c-155b1f44636e	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-14 00:00:33.516872+00	2026-10-14 00:00:33.516872+00
4ca58a0c-766a-41f7-8dd0-cc6d3113c0e2	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-14 00:00:33.516872+00	2026-10-14 00:00:33.516872+00
86f0fb74-bbed-4df6-a64e-c6bbcadff101	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-15 00:00:33.511113+00	2026-10-15 00:00:33.511113+00
e7a31e38-66fb-4a58-b40b-61951001b9cf	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-15 00:00:33.511113+00	2026-10-15 00:00:33.511113+00
9a862e2f-7cac-4873-a896-8bcc55fa6629	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-15 00:00:33.511113+00	2026-10-15 00:00:33.511113+00
7022a81d-b717-4b18-a752-a15670216f28	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-15 00:00:33.511113+00	2026-10-15 00:00:33.511113+00
9554c9e5-5eb6-4a3b-a5f0-3fb5303f75b0	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-15 00:00:33.511113+00	2026-10-15 00:00:33.511113+00
7fdf3619-4fa1-484d-85bb-9a3ee6a9f1c2	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-16 00:00:33.497594+00	2026-10-16 00:00:33.497594+00
0f34a9d5-7a6d-4509-b066-5fc29063d1bc	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-16 00:00:33.497594+00	2026-10-16 00:00:33.497594+00
ca9a3da5-24bc-43e1-b6c4-cfe815544628	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-16 00:00:33.497594+00	2026-10-16 00:00:33.497594+00
2caf2e86-2c54-4fec-a007-904dc1eda759	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-16 00:00:33.497594+00	2026-10-16 00:00:33.497594+00
fbd436f4-585b-4452-9a67-c2f21d9dd281	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-16 00:00:33.497594+00	2026-10-16 00:00:33.497594+00
28b81686-9920-4324-9fc6-2dc409e1919c	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-17 00:00:33.500085+00	2026-10-17 00:00:33.500085+00
d035b145-74bf-4552-8699-a1c136eade08	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-17 00:00:33.500085+00	2026-10-17 00:00:33.500085+00
c4c37f46-8a2e-4c4d-a2ac-b52c79f5d5d9	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-17 00:00:33.500085+00	2026-10-17 00:00:33.500085+00
120c0253-583b-465a-a7de-6e7698eab00a	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-17 00:00:33.500085+00	2026-10-17 00:00:33.500085+00
bef669b4-054a-4263-8893-f64ec20f99c6	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-17 00:00:33.500085+00	2026-10-17 00:00:33.500085+00
602afd8f-d184-4436-b0a3-38d1cea4cf78	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-18 00:00:45.303864+00	2026-10-18 00:00:45.303864+00
adc6b91d-37bf-4019-a271-914517ab4090	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-18 00:00:45.303864+00	2026-10-18 00:00:45.303864+00
0b023ab7-9076-43f2-963a-760fbce4613e	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-18 00:00:45.303864+00	2026-10-18 00:00:45.303864+00
a8ef335f-866e-4fb2-9db0-cc313f4fb0ca	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-18 00:00:45.303864+00	2026-10-18 00:00:45.303864+00
386a56ea-6c40-4859-9ef0-7ef67256127b	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-18 00:00:45.303864+00	2026-10-18 00:00:45.303864+00
5f674ee8-9570-4153-9896-87bcc55ce32a	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-19 00:00:45.30685+00	2026-10-19 00:00:45.30685+00
443659e0-3510-4f32-8f58-2bf60cf5eafb	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-19 00:00:45.30685+00	2026-10-19 00:00:45.30685+00
ef0d0e80-a854-4617-8c71-100f3ae56140	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-19 00:00:45.30685+00	2026-10-19 00:00:45.30685+00
2d30a06a-eabc-4851-88c2-1f423c7933a8	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-19 00:00:45.30685+00	2026-10-19 00:00:45.30685+00
66adfc00-0178-4a4a-8f59-351f5b28531d	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-19 00:00:45.30685+00	2026-10-19 00:00:45.30685+00
b386a152-3087-4f93-94bc-cf8c9733ebc1	33333333-3333-3333-3333-333333333333	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-20 00:00:09.08757+00	2026-10-20 00:00:09.08757+00
1fcb6eff-361b-4dc9-8650-ffaa17573530	33333333-3333-3333-3333-333333333334	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 66.67%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-20 00:00:09.08757+00	2026-10-20 00:00:09.08757+00
0edb61fc-5c1c-4731-81e0-a931195c099f	33333333-3333-3333-3333-333333333335	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 33.33%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-20 00:00:09.08757+00	2026-10-20 00:00:09.08757+00
2d92b8b2-1076-4731-83de-5f4d51ad07a8	33333333-3333-3333-3333-333333333336	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-20 00:00:09.08757+00	2026-10-20 00:00:09.08757+00
1edc3722-0c1a-46ae-a2ce-6d520d485bce	33333333-3333-3333-3333-333333333337	Cảnh báo chuyên cần	Tỷ lệ chuyên cần lớp K24-ELEC-A hiện là 0.00%.	attendance_risk	unread	/student/diem-danh	\N	2026-10-20 00:00:09.08757+00	2026-10-20 00:00:09.08757+00
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, order_code, lead_id, student_id, course_id, class_id, amount, discount_amount, final_amount, discount_note, status, payment_method, paid_at, notes, created_by, created_at, updated_at, deleted_at) FROM stdin;
66666666-6666-6666-6666-666666666601	DH00000001	55555555-5555-5555-5555-555555555507	fc4b6416-ee74-492e-a13f-1897064a779a	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	15000000	1500000	13500000	Ưu đãi đăng ký sớm giảm 10%	paid	transfer	2026-09-27 05:07:09.706+00	Đã thanh toán đủ qua chuyển khoản Vietcombank	44444444-4444-4444-4444-444444444444	2026-09-25 05:07:09.706+00	2026-10-20 08:52:16.158049+00	\N
66666666-6666-6666-6666-666666666602	DH00000002	55555555-5555-5555-5555-555555555514	98a56a05-dbf9-477b-a3d4-7d200140f1db	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	16000000	1000000	15000000	Voucher Zalo Mini App	paid	transfer	2026-09-15 05:07:09.706+00	Đã thanh toán qua Techcombank	44444444-4444-4444-4444-444444444445	2026-09-12 05:07:09.706+00	2026-10-20 08:52:16.158049+00	\N
66666666-6666-6666-6666-666666666603	DH00000003	55555555-5555-5555-5555-555555555519	\N	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	18000000	2000000	16000000	Ưu đãi sinh viên kỹ thuật	paid	transfer	2026-10-06 05:07:09.706+00	Chuyển khoản MB Bank	44444444-4444-4444-4444-444444444446	2026-10-05 05:07:09.706+00	2026-10-20 08:52:16.158049+00	\N
66666666-6666-6666-6666-666666666604	DH00000004	55555555-5555-5555-5555-555555555520	\N	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	15000000	0	15000000	\N	paid	cash	2026-08-28 05:07:09.706+00	Thanh toán tiền mặt tại quầy	44444444-4444-4444-4444-444444444445	2026-08-23 05:07:09.706+00	2026-10-20 08:52:16.158049+00	\N
66666666-6666-6666-6666-666666666605	DH00000005	55555555-5555-5555-5555-555555555506	\N	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	18000000	1000000	17000000	Ưu đãi đăng ký trước ngày 15	pending	transfer	\N	Khách đã gửi ủy nhiệm chi, chờ kế toán kiểm tra biến động số dư	44444444-4444-4444-4444-444444444444	2026-10-06 05:07:09.706+00	2026-10-20 08:52:16.158049+00	\N
66666666-6666-6666-6666-666666666606	DH00000006	55555555-5555-5555-5555-555555555513	\N	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	15000000	2000000	13000000	Chiết khấu đối tác doanh nghiệp Gara	pending	transfer	\N	Gara Sơn Auto đăng ký cho kỹ thuật viên	44444444-4444-4444-4444-444444444445	2026-10-05 05:07:09.706+00	2026-10-20 08:52:16.158049+00	\N
66666666-6666-6666-6666-666666666607	DH00000007	55555555-5555-5555-5555-555555555502	\N	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	18000000	1500000	16500000	Khách hàng nữ đam mê kỹ thuật	pending	cash	\N	Hẹn nộp tiền mặt vào buổi học đầu tiên	44444444-4444-4444-4444-444444444444	2026-10-07 02:07:09.706+00	2026-10-20 08:52:16.158049+00	\N
66666666-6666-6666-6666-666666666608	DH00000008	55555555-5555-5555-5555-555555555508	\N	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	16000000	0	16000000	\N	cancelled	transfer	\N	Hủy đơn do học viên đi công tác miền Nam dài hạn	44444444-4444-4444-4444-444444444445	2026-10-02 05:07:09.706+00	2026-10-20 08:52:16.158049+00	\N
476a031a-d783-4c97-bceb-eabb6e4d68b5	DH00000009	55555555-5555-5555-5555-555555555503	5fe4edef-3498-46fe-a735-2d3fd7dad19e	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	15000000	0	15000000	\N	pending	cash	2026-10-07 08:53:02.705879+00	Th? nghi?m chuy?n d?i h?c vi�n	11111111-1111-1111-1111-111111111111	2026-10-07 08:42:49.566173+00	2026-10-20 08:52:16.158049+00	\N
ebb9ad8f-1657-4de7-bec7-5a12536db5f2	DH00000010	e755645d-f430-4fa4-9446-9bad6550fcf5	\N	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	15000000	0	15000000	\N	pending	pos	\N	\N	44444444-4444-4444-4444-444444444440	2026-10-19 04:29:05.837053+00	2026-10-20 08:52:16.158049+00	\N
c0d7696c-791f-4494-bd1e-b06e4642e31e	DH00000011	55555555-5555-5555-5555-555555555503	5fe4edef-3498-46fe-a735-2d3fd7dad19e	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	15000000	2000000	13000000	\N	pending	\N	\N	\N	44444444-4444-4444-4444-444444444445	2026-10-19 07:30:36.267087+00	2026-10-20 08:52:16.158049+00	\N
87f56518-91f0-448d-8554-89c5ce1bb291	DH00000012	55555555-5555-5555-5555-555555555506	\N	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	30000000	0	30000000	\N	pending	\N	\N	[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 3 lần (40% - 30% - 30%)]\n• Đợt 1 (40%): 12.000.000 đ - Chưa thu (12.000.000 đ)\n• Đợt 2 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\n• Đợt 3 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\n<!--INSTALLMENT_DATA:{"plan_type":3,"total_installments":3,"installments":[{"round":1,"percentage":40,"amount":12000000,"status":"pending"},{"round":2,"percentage":30,"amount":9000000,"status":"pending"},{"round":3,"percentage":30,"amount":9000000,"status":"pending"}],"user_notes":""}-->	44444444-4444-4444-4444-444444444444	2026-10-19 09:37:47.775474+00	2026-10-20 08:52:16.158049+00	\N
b3ff4ed0-984c-48d1-8bce-61066e555ba2	DH00000013	55555555-5555-5555-5555-555555555503	5fe4edef-3498-46fe-a735-2d3fd7dad19e	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	30000000	0	30000000	\N	pending	transfer	\N	[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 3 lần (40% - 30% - 30%)]\n• Đợt 1 (40%): 12.000.000 đ - Đã thu (PT00000013-1, 12.000.000 đ)\n• Đợt 2 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\n• Đợt 3 (30%): 9.000.000 đ - Chưa thu (9.000.000 đ)\n<!--INSTALLMENT_DATA:{"plan_type":3,"total_installments":3,"installments":[{"round":1,"percentage":40,"amount":12000000,"status":"paid","receipt_code":"PT00000013-1","payment_method":"transfer","paid_at":"2026-10-19T09:56:47.132Z","collected_by_name":"sale2"},{"round":2,"percentage":30,"amount":9000000,"status":"pending"},{"round":3,"percentage":30,"amount":9000000,"status":"pending"}],"user_notes":""}-->	44444444-4444-4444-4444-444444444445	2026-10-19 09:55:46.865264+00	2026-10-20 08:52:16.158049+00	\N
fb2f38cc-6950-4418-abbb-09f51dd31ba3	DH00000014	55555555-5555-5555-5555-555555555516	\N	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	15000000	0	15000000	\N	pending	\N	\N	\N	44444444-4444-4444-4444-444444444446	2026-10-20 04:06:48.701216+00	2026-10-20 08:52:16.158049+00	\N
45c4d252-f329-4b71-b189-bea307684e11	DH00000015	55555555-5555-5555-5555-555555555503	5fe4edef-3498-46fe-a735-2d3fd7dad19e	54816ae7-7f12-4f99-9bb1-b5ad9f5fc9f0	3c80de01-543c-4e81-bb02-a4da1aec69b4	60000000	0	60000000	\N	pending	cash	\N	[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 5 lần (20% - 20% - 20% - 20% - 20%)]\n• Đợt 1 (20%): 12.000.000 đ - Đã thu (PT00000015-1, 12.000.000 đ)\n• Đợt 2 (20%): 12.000.000 đ - Đã thu (PT00000015-2, 12.000.000 đ)\n• Đợt 3 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\n• Đợt 4 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\n• Đợt 5 (20%): 12.000.000 đ - Chưa thu (12.000.000 đ)\n<!--INSTALLMENT_DATA:{"plan_type":5,"total_installments":5,"installments":[{"round":1,"percentage":20,"amount":12000000,"status":"paid","receipt_code":"PT00000015-1","payment_method":"transfer","paid_at":"2026-10-20T06:35:25.488Z","collected_by_name":"sale2"},{"round":2,"percentage":20,"amount":12000000,"status":"paid","receipt_code":"PT00000015-2","payment_method":"cash","paid_at":"2026-10-20T06:37:09.307Z","collected_by_name":"sale2"},{"round":3,"percentage":20,"amount":12000000,"status":"pending"},{"round":4,"percentage":20,"amount":12000000,"status":"pending"},{"round":5,"percentage":20,"amount":12000000,"status":"pending"}],"user_notes":""}-->	44444444-4444-4444-4444-444444444445	2026-10-20 06:35:04.811525+00	2026-10-20 08:52:16.158049+00	\N
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at, created_ip, user_agent) FROM stdin;
3375c268-412f-45ad-bbe6-b895c82d8061	11111111-1111-1111-1111-111111111111	3fc05e4569596d91ac7c88fa141a5de5190fa0263bdd3271dbbe367d612d0ee2	2026-10-04 03:31:31.941083+00	2026-10-08 06:31:26.518301+00	2026-09-04 03:31:31.987184+00	\N	\N
2df78eec-7957-4717-9e30-91a6574e2d26	44444444-4444-4444-4444-444444444445	42bd1432548e88bfc8244eb307337082a73c41021ca064868c1a130d6a110fbe	2026-11-06 04:27:42.931448+00	2026-10-08 09:47:58.085095+00	2026-10-07 04:27:40.746032+00	\N	\N
1dc7bcf2-cc6a-4ca0-ab1d-cf8ec1586a2a	33333333-3333-3333-3333-333333333333	4882e79ae4d7bdef8cf3088c73ad820d3fd8ba0e5946537ad2f56d32f44af59d	2026-09-18 07:19:06.339126+00	\N	2026-08-19 07:19:06.362873+00	\N	\N
651c295a-c0fa-4985-b679-c9adce88b50f	22222222-2222-2222-2222-222222222222	448c63287a0c65effdf0f4d20d95851cd5d6279ec45d80715073c982dd69a079	2026-09-19 06:36:30.715595+00	2026-08-20 06:41:31.09145+00	2026-08-20 06:36:29.830196+00	\N	\N
7925f0a6-f9f3-4d4d-815b-8785f85a7e36	33333333-3333-3333-3333-333333333333	14fcb5b58f3a580700b56499c6a7b933d3927b25e88f7b01bfc63b8bb42385be	2026-09-18 07:20:12.03089+00	\N	2026-08-19 07:20:12.054768+00	\N	\N
7cfb90bf-e878-4bd0-b163-808edbf5b347	22222222-2222-2222-2222-222222222222	1ec4aa58709dd16c38da148eb7afa138aedbf15b65ea91c27aa2bea3bbdc26d5	2026-09-19 06:42:31.519342+00	2026-08-20 06:45:28.084452+00	2026-08-20 06:42:30.649796+00	\N	\N
a3e06c5c-f79d-4c8e-966b-5466b58dbf4f	11111111-1111-1111-1111-111111111111	9f88c49552f295bc4adb1ebc1f2f1c989db67a8b1ab23f7a450643338fee6cac	2026-09-18 07:20:54.240542+00	2026-08-19 07:21:06.854264+00	2026-08-19 07:20:54.264441+00	\N	\N
2a5d4d8a-5db9-4009-8f64-b724f212e062	22222222-2222-2222-2222-222222222222	92db5a5ec60f43eb06e82abc759ca07f11fa732dcb4bf7403dc759278cb94a04	2026-09-18 07:21:13.397345+00	2026-08-19 07:21:40.020018+00	2026-08-19 07:21:13.48208+00	\N	\N
b5292892-5716-44ba-b47f-e31f4e514636	11111111-1111-1111-1111-111111111111	e1a48fa7111981c20efbd24976958eae187d0a180127d7e4e926e99a84b56255	2026-09-19 07:01:17.797675+00	2026-08-20 07:26:29.529463+00	2026-08-20 07:01:16.979716+00	\N	\N
b8d4d90c-e7f5-48b2-9a5b-337384456a74	11111111-1111-1111-1111-111111111111	8aa96b9450eff992e83df8bdc548b245531d55ac2ffe943e8d91eb49dfc9a2af	2026-09-19 06:36:00.942673+00	2026-08-20 07:26:30.591931+00	2026-08-20 06:36:00.056581+00	\N	\N
a999e34a-0715-48c3-98bd-5183345c31d7	11111111-1111-1111-1111-111111111111	5cf84ef08faa65d424e3e9835634d5b3536f939039d3b113a03d7fdd350ec0ad	2026-09-19 07:26:30.653396+00	2026-08-20 07:26:30.591931+00	2026-08-20 07:26:29.902757+00	\N	\N
cdd094f2-0d81-448c-a3ca-3599c47e5ef2	33333333-3333-3333-3333-333333333333	abd61230e1286820767a952d08f9ba407aefd704598a86846184b804b340526a	2026-09-18 07:21:41.567938+00	2026-08-19 07:47:00.615494+00	2026-08-19 07:21:41.653337+00	\N	\N
02457fc9-2e52-48aa-8534-a39f66ccea23	33333333-3333-3333-3333-333333333333	38c5ebed436113a4060d10624435d5b9bdc966d1f779c0610ccc0383d38aeb51	2026-09-18 07:47:00.715322+00	2026-08-19 07:47:32.684722+00	2026-08-19 07:47:00.740785+00	\N	\N
8472cf7a-3b5d-4ef4-a540-464c37116c5b	11111111-1111-1111-1111-111111111111	81f79612e70da0fc9b24d1ce1ec8643dc63c8a97985a5a4c3967c396f9807831	2026-09-19 07:26:34.704596+00	2026-08-20 07:26:43.57696+00	2026-08-20 07:26:33.954388+00	\N	\N
e67e1a4d-2a45-4fc8-a61f-bbd61dc85683	11111111-1111-1111-1111-111111111111	b2e6f9f8b9decadf4fda179a9ff5d0196ac5facf06f55622e5e171c0cdf738b5	2026-09-18 07:47:36.078325+00	2026-08-19 07:54:48.086909+00	2026-08-19 07:47:36.104213+00	\N	\N
6ac6b2fb-897b-4f43-a83e-9cf11cf7b1c3	22222222-2222-2222-2222-222222222222	a732ad4453d86dcb596831e9d09d3d74af708be300305626f1d3fb8607928cf6	2026-09-18 07:07:14.010247+00	2026-08-20 08:19:17.821348+00	2026-08-19 07:07:14.104239+00	\N	\N
c63defda-25a5-4dc4-9cc9-1d3b2d362271	11111111-1111-1111-1111-111111111111	805dbd2322aeaf22711f0dee36d4780c6c63cc8a4b25341a4016d6d17e3f2ecd	2026-09-18 07:54:48.189083+00	2026-08-19 07:59:24.889957+00	2026-08-19 07:54:48.216074+00	\N	\N
affa5540-eebb-4c8e-b0d7-b857f36a1b15	22222222-2222-2222-2222-222222222222	e9c8f9f295d96f9cee1908cea026a2cb80f1f393403a44d9aaac464a2cbad1b8	2026-09-19 06:36:29.517274+00	2026-08-20 08:19:17.821348+00	2026-08-20 06:36:28.633264+00	\N	\N
119a4e55-6c3b-407e-a6ea-360dd4d515be	11111111-1111-1111-1111-111111111111	626358fe8e738944f11b873604005041cb86906302f43c17924b471b062715de	2026-09-18 07:59:24.990255+00	2026-08-19 08:07:48.579667+00	2026-08-19 07:59:25.017717+00	\N	\N
7639ff19-c8d1-45b8-81d7-2496848f59bf	22222222-2222-2222-2222-222222222222	421168316529d2d4904e3ed50aec04665de147a06590701161555d5cc33258bf	2026-09-18 07:19:05.339282+00	2026-08-20 08:19:17.821348+00	2026-08-19 07:19:05.487242+00	\N	\N
6ce419f8-2acf-4dff-97ac-e0c29165acbc	22222222-2222-2222-2222-222222222222	8520a08944c6c8bf55a71e13944174fafc70268630ad259c3d432b82ec8f210d	2026-09-18 07:20:11.229445+00	2026-08-20 08:19:17.821348+00	2026-08-19 07:20:11.253485+00	\N	\N
2bb03af7-ed5a-4a52-afdf-dabbf03f714b	22222222-2222-2222-2222-222222222222	ab604f0412e86192bad24b957636f5aecf0d9f2ece0810913122d3ff74e78b84	2026-09-19 06:42:31.321197+00	2026-08-20 08:19:17.821348+00	2026-08-20 06:42:30.448419+00	\N	\N
e3221959-803b-4c9d-bf46-fe79d1416f75	11111111-1111-1111-1111-111111111111	1f7a3ed31fe7bde62e3a1a52a8379f76aef22780916f54edd18853aaf1b3fd13	2026-09-18 08:09:40.394351+00	2026-08-19 08:18:31.99488+00	2026-08-19 08:09:40.708966+00	\N	\N
cf84b7ff-abbe-446f-8875-67c0f9439ab8	22222222-2222-2222-2222-222222222222	56966e3875450c0962ce097edb9721fba03cae02ba317ccb19be0db9e2b3cad3	2026-09-19 07:26:45.955289+00	2026-08-20 08:19:17.821348+00	2026-08-20 07:26:45.207463+00	\N	\N
ad294828-b2a2-45fb-9dc2-89b001cf0327	22222222-2222-2222-2222-222222222222	c8de74a79bef40394bac5a05af54fd3a4376b1d770575758566ef0d926c40cb1	2026-09-18 08:28:15.40695+00	2026-08-20 08:19:17.821348+00	2026-08-19 08:28:15.773175+00	\N	\N
7d4e39d8-ee45-4d7a-9e47-71efe350a6e7	11111111-1111-1111-1111-111111111111	fae49b3e22ba933d5f34ada93376d0fade835dcf45fe4e24a17f2d8115bdbb38	2026-09-18 08:18:32.079488+00	2026-08-19 08:18:39.47226+00	2026-08-19 08:18:32.415988+00	\N	\N
91de1644-28cf-4539-82d1-1de3402ad496	22222222-2222-2222-2222-222222222222	5eb4c904a3a2f3600bc896a3e47dd3f894138808bc42d78e9ff37bf07c7be12f	2026-09-18 08:49:14.660845+00	2026-08-20 08:19:17.821348+00	2026-08-19 08:49:15.07668+00	\N	\N
5a61d232-79b1-4c88-847c-35e8e6b3c9e6	11111111-1111-1111-1111-111111111111	681299d896b95150c6c60b698f689a54304f7d3c1e91eebb5c35abab40e0cfe7	2026-09-18 08:18:39.532892+00	2026-08-19 08:21:46.179303+00	2026-08-19 08:18:39.872401+00	\N	\N
ff116932-2991-470e-9679-0d27d5c54c06	11111111-1111-1111-1111-111111111111	8ec179c6b7d3a244cc25eb67310fbd3537665284b73cd614dd4c65ab1c732921	2026-09-19 08:40:32.109786+00	2026-08-20 09:12:14.95669+00	2026-08-20 08:40:30.991665+00	\N	\N
dd1e4efe-e475-4fa9-836a-d0cc66f0b00b	33333333-3333-3333-3333-333333333333	c9fc0620679bc694bedf3a3d33934e9d481c9158feb1b9f940e2aa386c5344db	2026-09-19 09:23:35.429577+00	\N	2026-08-20 09:23:34.428271+00	\N	\N
aff221e5-defc-4f2c-b90b-c6fb81765ff0	11111111-1111-1111-1111-111111111111	8bb4dc046e56857cc667c1b5545b533c329edeb3908890ae7a2ffeeb444b891d	2026-09-18 08:21:46.258538+00	2026-08-19 08:23:11.921656+00	2026-08-19 08:21:46.606142+00	\N	\N
28c92788-49da-4bc3-a23e-8e97d414bd35	33333333-3333-3333-3333-333333333333	c14f2557fd7f6ad1006d295d884a408a82579baf124d3db8279e957fae138f26	2026-09-19 09:23:35.436433+00	\N	2026-08-20 09:23:34.435085+00	\N	\N
30becc73-b0ba-46d5-b3d6-3e20d1d58a30	11111111-1111-1111-1111-111111111111	fa74a9744b6946544080b6abcca88bb39838cd4b37e9dfd347790498c9196e9b	2026-09-18 08:23:11.983402+00	2026-08-19 08:26:57.891161+00	2026-08-19 08:23:12.334313+00	\N	\N
87ed111e-5df4-4a10-a63c-eb9d46708068	11111111-1111-1111-1111-111111111111	03393818f8eff3191683cc728d3d74fa356094be833174d9c8aaf51e5efc5e53	2026-11-05 04:06:25.742029+00	2026-10-06 04:31:09.989266+00	2026-10-06 04:06:25.764912+00	\N	\N
8d546dff-7f2a-470e-b6af-7eaf544c4fff	33333333-3333-3333-3333-333333333333	e2834a32966d4773d0a1f83492002f8b3e01d536e27266c92d0b34f3839da12b	2026-09-18 08:28:16.054196+00	2026-08-19 08:28:18.221457+00	2026-08-19 08:28:16.414475+00	\N	\N
d652a5f8-80ca-46b1-ae98-e6bd4c41f227	44444444-4444-4444-4444-444444444444	4684adfc75b9c67a9e5a0f26ae58e02e440094942aff6ea2cb778d853756ce61	2026-11-06 04:27:29.372061+00	2026-10-07 04:27:32.279592+00	2026-10-07 04:27:27.193086+00	\N	\N
b93f66aa-b691-4324-af47-ec80724eb5ed	11111111-1111-1111-1111-111111111111	4e9076a80f2dde0c727a6a564fd267665a588357a7cf1ad90c33f681c0039b80	2026-09-18 08:36:38.412779+00	2026-08-19 08:36:45.289421+00	2026-08-19 08:36:38.799679+00	\N	\N
8972a8fa-8170-4a55-930d-76e50731e238	22222222-2222-2222-2222-222222222222	7d4b85400f7057906b5cf8f2eeb6d57df55ffc6fb4684d957faddca640ae7ee1	2026-09-18 08:36:48.044123+00	2026-08-19 08:36:54.727373+00	2026-08-19 08:36:48.425988+00	\N	\N
802db64f-2d83-45eb-802f-c829f8b862e5	44444444-4444-4444-4444-444444444445	7a78dc223b48140299078f5d898745ac704d18493515decf622bf868a9367939	2026-11-06 04:27:35.681545+00	2026-10-07 04:27:40.541694+00	2026-10-07 04:27:33.50322+00	\N	\N
b5997d66-8392-43fa-a08e-c42e7b865239	11111111-1111-1111-1111-111111111111	3d99bcf4940cbf1a1bd0c0d764f0ece51c01f60cdc37816811292637538fd24e	2026-09-18 08:41:37.490958+00	2026-08-19 08:41:49.002671+00	2026-08-19 08:41:37.884406+00	\N	\N
fb1160b7-a765-474b-9670-71d59e029fca	11111111-1111-1111-1111-111111111111	0333c4dbdee9ab1b27afe356849c65fe4c0b63688951bddfc1a8271463c41d6f	2026-09-18 08:41:49.037409+00	2026-08-19 08:41:51.499511+00	2026-08-19 08:41:49.436892+00	\N	\N
8c1c2c19-aec7-4157-bd0d-1c99130dc39c	33333333-3333-3333-3333-333333333333	a45eee32e3c096fb174e90e0c47cb9d72c29482962bb65e8721c99583d329156	2026-09-18 08:41:53.738645+00	2026-08-19 08:41:59.354975+00	2026-08-19 08:41:54.13929+00	\N	\N
72087607-6cfa-4054-9130-5f21cade24e5	11111111-1111-1111-1111-111111111111	5f38ebea96aa09ab55e79794d353efbbfb227375908c7bdbc411e3bb2cbb7006	2026-09-18 08:42:00.884765+00	2026-08-19 08:44:28.830925+00	2026-08-19 08:42:01.281606+00	\N	\N
7cee9439-1cff-410d-a40b-8c4e8c8ee202	11111111-1111-1111-1111-111111111111	391217d247b833c34dbd0209cf558ae56cd82d545a9c93f9c4fc54d587e6a7bf	2026-09-18 08:44:28.801582+00	2026-08-19 08:44:31.003896+00	2026-08-19 08:44:29.20638+00	\N	\N
612f50db-0b5a-41fc-beed-1b80eb54eeaa	11111111-1111-1111-1111-111111111111	3511b67d07e629ea13eecaf0d7551bbb8dee27b80fa54777232596b9d7d36fb3	2026-09-18 08:44:32.429064+00	2026-08-19 08:44:44.029407+00	2026-08-19 08:44:32.832385+00	\N	\N
aa61463b-ec3e-4a5d-a6ee-b55b70c189f4	11111111-1111-1111-1111-111111111111	4f02acbfae67e7bbc82e13383155bf1affca6ba73bf33431aea94302257fe92e	2026-09-18 08:44:45.140717+00	2026-08-19 08:47:13.928698+00	2026-08-19 08:44:45.549836+00	\N	\N
d20e4f97-9950-4e12-86c6-6b89184348ee	33333333-3333-3333-3333-333333333333	2d57a012c43601ab041ad4a1d0b7e44bb193e597b381b64db9ac47219f114df1	2026-09-18 08:47:16.283034+00	2026-08-19 08:47:30.862217+00	2026-08-19 08:47:16.694161+00	\N	\N
13319af3-4a5d-45c6-b478-02ee0560113f	11111111-1111-1111-1111-111111111111	0a22cd700f7185772d3ff2172aa7e0c2037f2ab35732f9b93e7d28c6ca95815a	2026-09-18 08:47:39.656663+00	2026-08-19 08:47:57.633747+00	2026-08-19 08:47:40.068238+00	\N	\N
ac149163-3294-4a8f-8a2a-cb02c32c930a	22222222-2222-2222-2222-222222222222	ddd6f62ef0739efb3e019ecbbae7a0e0cedd5bab308488f80c1773edad68e67d	2026-09-18 08:47:58.682694+00	2026-08-19 08:49:14.71377+00	2026-08-19 08:47:59.095217+00	\N	\N
23f592ef-fd4c-4f31-b395-88d472654d79	11111111-1111-1111-1111-111111111111	b58ae6244ffb8eb7867432b07d2d338b8a176214494ce8b72a4adb5b8b8d8334	2026-09-18 08:07:48.68055+00	2026-08-19 08:54:39.115525+00	2026-08-19 08:07:48.707966+00	\N	\N
fa90d767-f395-4842-b87f-9b0025e79c3d	22222222-2222-2222-2222-222222222222	83d51fc7681776b73d577335adcb76fe424328d5835af6ef85f9ad2ca4e2d5b7	2026-09-18 08:49:14.951243+00	2026-08-19 08:49:19.288525+00	2026-08-19 08:49:15.372734+00	\N	\N
920a1926-a7a3-4c98-9658-f8d30e7d620c	11111111-1111-1111-1111-111111111111	2a59248ab1d785e93e1173a10e4b3f391192907e112e512a72a1c61866003afc	2026-11-07 04:09:29.516394+00	2026-10-08 04:24:31.043129+00	2026-10-08 04:09:29.626645+00	\N	\N
56eccd5b-31c5-48df-9085-b22b74019eab	22222222-2222-2222-2222-222222222222	0aa4acd1b1e8769625dee74a4ed5700714924684b42371fd9f71e66035b00273	2026-09-18 08:49:19.307062+00	2026-08-19 08:50:16.206431+00	2026-08-19 08:49:19.729648+00	\N	\N
3e8a48a1-1a2c-4a6f-aa98-6e5587da541d	33333333-3333-3333-3333-333333333333	6d890c7e8ccb27d5dbf5249b388afa4c844fb6b3039ddf4714fb21a9a01e24a5	2026-09-18 08:50:17.619629+00	2026-08-19 08:51:23.869471+00	2026-08-19 08:50:18.0391+00	\N	\N
931d76c5-7f14-47e1-a4ce-c7c1ecdbe7d6	11111111-1111-1111-1111-111111111111	34c2b1df29636b2c378d3fd875bff036cef1db1ffd333b71b500ac4421a06990	2026-09-19 06:36:00.943174+00	2026-08-20 06:36:26.169854+00	2026-08-20 06:36:00.057143+00	\N	\N
eb83946e-76ae-45f0-8450-879dfb654642	11111111-1111-1111-1111-111111111111	a3aa7bddd65e8d5de1030504d8b1c3222e2d1d5d029c4756026caadde98cff87	2026-09-18 08:51:54.233537+00	2026-08-19 08:54:07.547601+00	2026-08-19 08:51:54.661683+00	\N	\N
6573dda9-b010-4e64-b7ef-3bff4b1feeff	11111111-1111-1111-1111-111111111111	8298d7b29e71547f9afadeb875d6779c8602cce320e12b64b702fdee98d13b08	2026-11-08 07:49:18.965513+00	2026-10-09 07:56:09.086845+00	2026-10-09 07:49:19.193871+00	\N	\N
27c12564-7203-4c13-b08e-7fb1c17b3b18	11111111-1111-1111-1111-111111111111	291f3bce74472ef63f44fa356e097a94ee11c97765f33a7b7c3eeabb0b389f1c	2026-09-18 08:57:39.988733+00	2026-08-19 09:21:05.986069+00	2026-08-19 08:57:40.431151+00	\N	\N
c56b5308-e439-44e1-b2ab-cb9700801f8c	11111111-1111-1111-1111-111111111111	15d40ac9976319a23e23561d2471616c92cb40718dcbe34120a7019095bb4dbf	2026-11-07 04:24:31.116711+00	2026-10-08 04:25:25.011427+00	2026-10-08 04:24:31.282084+00	\N	\N
8f4305e0-7b4f-473e-9dec-2af1ee551718	22222222-2222-2222-2222-222222222222	9866eeebc77150aca8025d9d5f38216a7d5a9171c32fdca7c51fb2b05bc5bf72	2026-09-19 06:41:32.335945+00	2026-08-20 06:42:14.043254+00	2026-08-20 06:41:31.463063+00	\N	\N
f8e00bf9-7427-4c0e-a8e3-0c8d918abab6	11111111-1111-1111-1111-111111111111	e50c724c66ab65969ad5a0391dced48ae776fdb8aa439ac611a189a66546830f	2026-11-07 04:25:25.067693+00	2026-10-08 04:32:47.138379+00	2026-10-08 04:25:25.222855+00	\N	\N
c6f397a2-28dd-41d4-83f2-4c1ff69c2cd6	44444444-4444-4444-4444-444444444440	7749b95d638cbaaa430564f14501a5ffe8ddb9d55c8ce4e7dea3bb9cf09ddaa3	2026-11-18 05:03:32.257876+00	2026-10-19 06:24:46.068393+00	2026-10-19 05:03:31.72393+00	\N	\N
6b224b4a-77ec-406b-9ef2-6a0ac10a1add	22222222-2222-2222-2222-222222222222	f7c9bb982063b11e2b293974a62fde675407311210664ec8fb0122e994715cd2	2026-09-19 06:42:15.292524+00	2026-08-20 06:42:30.083938+00	2026-08-20 06:42:14.422676+00	\N	\N
16c242bc-e694-4caf-978e-4b3c6605f022	11111111-1111-1111-1111-111111111111	816f5696114f7ed620b123d458fc39eaf1282c1d7be1bb80c0e97a63d8297d39	2026-11-07 04:32:48.688471+00	2026-10-08 04:50:21.611368+00	2026-10-08 04:32:48.874974+00	\N	\N
c33e8ac9-0161-495e-bc5a-1e76a65bf42d	11111111-1111-1111-1111-111111111111	432ea0b3e63f78a115137731afa82a2f79a6697f47e35dd61839c01bf89a2a72	2026-11-05 07:07:32.322638+00	2026-10-08 06:27:30.917965+00	2026-10-06 07:07:32.345713+00	\N	\N
0fdd0ebc-f70d-47a6-9f90-20a723ccd676	22222222-2222-2222-2222-222222222222	e3ef48a11c616ac94680f16877cfa540a537f19db88e39442f19a1c4d1104b56	2026-09-19 06:45:29.320817+00	2026-08-20 06:46:24.169469+00	2026-08-20 06:45:28.456835+00	\N	\N
b46714ed-bd32-429e-8251-90da5d69427a	11111111-1111-1111-1111-111111111111	312c709deb56aeb0be92b2cc15ec548a09047b95be612cd5c0f8ff5b9d04777a	2026-11-05 04:30:54.457082+00	2026-10-08 06:31:26.518301+00	2026-10-06 04:30:54.480565+00	\N	\N
8b8109d6-4735-44fe-83cd-756bd086c10b	11111111-1111-1111-1111-111111111111	8370c29b78c33e001d6296c3bb3b5588e20190f5358ce0808c9c5ee25308d536	2026-09-19 06:46:26.866837+00	2026-08-20 06:52:02.373173+00	2026-08-20 06:46:26.007287+00	\N	\N
4cf19e60-7784-409e-88e5-9c05fa4b1b41	11111111-1111-1111-1111-111111111111	6ba0c82b6816ad4a0e4e765c458a1f71becd32f3d8002263a2c316b4ca2ada49	2026-11-08 08:13:05.502802+00	2026-10-09 08:22:28.748956+00	2026-10-09 08:13:05.793872+00	\N	\N
bc597e60-dfa5-4d3d-b88d-677f4afddda4	11111111-1111-1111-1111-111111111111	695f3efce87e231b32de7529604f0954bf2a99f31a9348541d7ac4ae44dcfc73	2026-09-19 07:33:34.201512+00	2026-08-20 07:41:56.284495+00	2026-08-20 07:33:33.469164+00	\N	\N
283f909c-e4d1-460e-bd17-571aeebaa782	44444444-4444-4444-4444-444444444445	89d3ae6c321f0723a882dfa5ad0a6cb703e4f6de0c097709f68a2d42e7f06e12	2026-11-18 07:46:44.472167+00	\N	2026-10-19 07:46:43.872313+00	\N	\N
591de3d6-b050-4815-a44c-19e423c8a9df	11111111-1111-1111-1111-111111111111	b99ae04b27a0e7093a6c86366fd90cfb2a430d002ed0ea30f7abf4f1b730f276	2026-09-19 07:41:57.370087+00	2026-08-20 07:42:02.340044+00	2026-08-20 07:41:56.66289+00	\N	\N
3d26226a-d9d8-4370-834a-ecce982655eb	22222222-2222-2222-2222-222222222222	f54a7eac9a7b4f01b9391fd6166a2fb711047ef50b18097c682165ba09e38682	2026-09-18 08:49:19.261018+00	2026-08-20 08:19:17.821348+00	2026-08-19 08:49:19.677577+00	\N	\N
16b32a3c-9fb0-4676-a06b-fdfb8048c630	22222222-2222-2222-2222-222222222222	0d5906cf43a97fc4bcc71679ec1f0ea6596ac9543d9588b74db8d98fe9abc271	2026-09-19 06:41:32.333434+00	2026-08-20 08:19:17.821348+00	2026-08-20 06:41:31.459517+00	\N	\N
b3dd42a1-89a1-4d25-b3dc-f836602782e8	22222222-2222-2222-2222-222222222222	2bdfba399b33937633286d77e5a2427105400657ca9bbb081fe9a7a5e86510e4	2026-09-19 06:42:15.283523+00	2026-08-20 08:19:17.821348+00	2026-08-20 06:42:14.411348+00	\N	\N
ae26d3c0-7f1f-4206-8144-b530f9f4b9c7	22222222-2222-2222-2222-222222222222	f4ea46d17718818edcd46038834f2913903730f8a5200b076e8917d5344e1974	2026-09-19 06:45:29.314346+00	2026-08-20 08:19:17.821348+00	2026-08-20 06:45:28.449389+00	\N	\N
d1618093-90bc-46da-963d-4bdb1caa3772	11111111-1111-1111-1111-111111111111	979dacab248da51c2ba10d1bd9f60db0d42177c360c06e7f479ea6019db0be97	2026-09-19 09:12:16.365728+00	2026-08-20 09:12:15.944887+00	2026-08-20 09:12:15.332686+00	\N	\N
53834da7-2f24-476d-99d6-3e1c14c9a836	44444444-4444-4444-4444-444444444445	45315f9193b4d805275c42e86b126bc91cea2cc41bfb5fbfe479b0d3e4da6a7b	2026-11-18 08:06:51.988206+00	2026-10-19 08:06:59.227478+00	2026-10-19 08:06:51.454321+00	\N	\N
e6666ba2-38ff-4303-acc0-0f90c4a06eef	33333333-3333-3333-3333-333333333333	71f6bb15af8ff85664cd10e5e56ef69907d3a2de9405fff41049b09fd7dea6b1	2026-09-19 09:12:21.924576+00	2026-08-20 09:12:42.885137+00	2026-08-20 09:12:20.892844+00	\N	\N
e6763855-0d08-489b-bfb5-ab7dfa5a4853	44444444-4444-4444-4444-444444444440	323ae34d56f4e0f88f58add370273957efa136d4e0eaf6586c54bda7c19cfeae	2026-11-08 08:35:24.908231+00	2026-10-09 08:35:49.174651+00	2026-10-09 08:35:25.254704+00	\N	\N
d5cba338-57f7-446a-ab10-13990a75b66f	33333333-3333-3333-3333-333333333333	1b1bed6f5f05db9998395067f3547efa5b5e57c6542875831c541d52e04041d4	2026-09-19 09:12:44.29163+00	2026-08-20 09:12:55.719618+00	2026-08-20 09:12:43.261229+00	\N	\N
f23cfc4d-f580-43cd-9280-41e4100fa551	11111111-1111-1111-1111-111111111111	91b615e1f4a59a01889cafc52ad922243cdc01fa0811ec4d9f894d61c5cde503	2026-11-08 08:34:09.383212+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:34:09.726966+00	\N	\N
f52b1346-057e-4c23-b7ad-96c0402f76d0	11111111-1111-1111-1111-111111111111	bf17647b77ee93ccb34d7010f9045ad888ee59eac2e52639849f603e539f7f2c	2026-09-19 09:12:59.010666+00	2026-08-20 09:13:57.907342+00	2026-08-20 09:12:57.980908+00	\N	\N
ae29c5eb-2f84-42ab-ab92-8707b083644c	44444444-4444-4444-4444-444444444445	16473e72380ed90b4724760548f82db539777d88d3e397c58eb7008ae831f57d	2026-11-18 08:35:19.717053+00	\N	2026-10-19 08:35:19.250956+00	\N	\N
712a56b2-b099-4033-a644-feac611fda5c	11111111-1111-1111-1111-111111111111	9d26db3edf07a554f16b4264ff28b1916e1bfc85d0bb90eed79a5d626281306f	2026-11-05 04:05:19.749472+00	2026-10-06 04:06:25.634978+00	2026-10-06 04:05:19.772147+00	\N	\N
b5983460-c4aa-4a14-a495-8e8171930068	33333333-3333-3333-3333-333333333333	63f78160e193da97948f48e3f8fc84b60a383fa4566c739ca56fc9a9d5bf63f9	2026-11-08 09:13:18.815365+00	\N	2026-10-09 09:13:19.268616+00	\N	\N
0f333435-41c7-4cb2-b11f-2cb7cfef7547	11111111-1111-1111-1111-111111111111	7a5ded72855c4e5686b5086b095fa14920288783f549d8867188b3b1c8c963b6	2026-11-05 04:31:10.089296+00	2026-10-06 04:57:03.228113+00	2026-10-06 04:31:10.112918+00	\N	\N
2813f0c0-864c-45af-b427-b9f21015aba6	44444444-4444-4444-4444-444444444440	465df205f66f99e617a70972797ed0f24184de6cce572b316b36420dfa771de1	2026-11-08 08:35:24.890677+00	2026-10-16 07:33:15.652628+00	2026-10-09 08:35:25.239065+00	\N	\N
7c5593a0-8384-4aa2-bf00-8761e0b83986	11111111-1111-1111-1111-111111111111	e9b86b51f5cef3974fb8f5e5c567d63b1d34b7db3d3fc83abd8b45985df23807	2026-11-05 04:57:03.330565+00	2026-10-06 06:31:14.429282+00	2026-10-06 04:57:03.353975+00	\N	\N
ec9a71ae-c4da-4747-a80c-83b4e791a081	44444444-4444-4444-4444-444444444444	6e46e3d02aa8445a7167b53cfb883b3c79111472a202efcabbfcb3c21a6de542	2026-11-06 03:57:05.940352+00	2026-10-16 07:52:16.30955+00	2026-10-07 03:57:03.678433+00	\N	\N
43a7f2ca-d551-4c22-8078-c938a32604e6	11111111-1111-1111-1111-111111111111	696bf1a4a8a4742902a54db4ac6e7572f98e7ab4b3cdbf34c68a731352ac1755	2026-11-05 06:31:14.534771+00	2026-10-06 07:07:32.215989+00	2026-10-06 06:31:14.557847+00	\N	\N
de2aedb3-5af8-4f21-b3ff-dac616e4261f	44444444-4444-4444-4444-444444444444	11e3db8d345f1c36077f7812e4e5c84b037a6658153c03b021e886d51264c06a	2026-11-06 04:06:15.127357+00	2026-10-07 04:16:37.192558+00	2026-10-07 04:06:12.881397+00	\N	\N
3608b985-c2c8-4101-8aa1-979803d5f50d	11111111-1111-1111-1111-111111111111	77009b59225f61ff74752f01fdc48c72adf88df5c299cd1b37d573e2373544a2	2026-11-06 04:16:41.104494+00	2026-10-07 04:16:49.158639+00	2026-10-07 04:16:38.887996+00	\N	\N
42dc1211-f3d4-412f-8d8e-2e0948617d79	11111111-1111-1111-1111-111111111111	696d60ec3cc3ea5966a623f51b852f9a0a7f4866f1e852a6fe378ac889e93ea9	2026-11-06 04:26:05.439983+00	2026-10-07 04:27:25.371117+00	2026-10-07 04:26:03.257128+00	\N	\N
287f42b1-363c-42a3-a727-88c090916ce9	44444444-4444-4444-4444-444444444445	25597c0a639e41aea246e114031cee3a3b3068db349eec77489a4f53d083e337	2026-11-06 04:27:42.963203+00	2026-10-07 04:28:02.633137+00	2026-10-07 04:27:40.784941+00	\N	\N
05243034-eeb3-4e3a-99e3-0d8d767314ee	11111111-1111-1111-1111-111111111111	89232c6b2a45199de0e22debadf05e3c764f2822a1dfd02ddb507446bba6d840	2026-11-06 04:54:01.751882+00	2026-10-07 04:55:05.598963+00	2026-10-07 04:53:59.637983+00	\N	\N
0f064139-baa2-4a2c-bcd1-e639e9b7ba56	44444444-4444-4444-4444-444444444440	0e107d7215c6f3aed1e6329ddd8efa4af4c5814f68702e0e8b8844c71a59d8e8	2026-11-06 04:55:09.202995+00	2026-10-07 04:59:22.843977+00	2026-10-07 04:55:07.091328+00	\N	\N
215e85e0-82db-496a-be4e-3321e3f339b6	11111111-1111-1111-1111-111111111111	f24d1e3b67688a4f6f2420e8c87088c773efed55d215599892fa6f952f3c7bfd	2026-11-06 04:59:26.742705+00	2026-10-07 05:01:44.394866+00	2026-10-07 04:59:24.642482+00	\N	\N
070ab523-b9fe-47ad-920f-b9b085e8d591	11111111-1111-1111-1111-111111111111	1b1df3c95f75aae6989d96b4d311cd06af3427d0135cf00414ab683347798958	2026-11-06 05:01:46.738751+00	2026-10-07 05:32:51.664083+00	2026-10-07 05:01:44.655208+00	\N	\N
e87c6704-d430-4ec8-bed0-8795f9112c4d	11111111-1111-1111-1111-111111111111	d18355819b9a21bf7637f2e60b7c4a8e5002e823da17febff36ea1b1bb8e61b7	2026-11-06 05:32:54.403345+00	2026-10-07 05:33:11.303189+00	2026-10-07 05:32:51.943848+00	\N	\N
afe0dd85-d8b7-4e78-adf0-c4370d3e7845	44444444-4444-4444-4444-444444444440	2d35dbfa88f335d3b45befb4a262ffc871fd26b75a8eca1ed0f2f5fcc6c3bc0a	2026-11-06 05:33:19.091231+00	2026-10-07 06:17:48.574211+00	2026-10-07 05:33:16.632863+00	\N	\N
fadeb564-02de-40aa-ad5d-e8c78d243e99	11111111-1111-1111-1111-111111111111	04f3492be35fcbb44f701334923e4f8a7a642be8556ea35d5aaf4d3bc9d0da98	2026-09-19 06:28:10.357791+00	2026-08-20 06:35:59.673974+00	2026-08-20 06:28:09.449657+00	\N	\N
d5b5f7f0-fc21-433b-bf54-22c3382e691b	22222222-2222-2222-2222-222222222222	a792b72e53e220d0ae1fd3eb121b5e4ef2b5ae5400206c086a756af82991b737	2026-11-07 04:25:20.94691+00	\N	2026-10-08 04:25:21.101027+00	\N	\N
7cd6a6cc-5aa6-40d6-a2ed-9d7a3345b41e	11111111-1111-1111-1111-111111111111	c165a88e820ef6a33564a47f445093ca988384ef8115c32b5c8a3484ba4c3f86	2026-09-18 08:55:15.320021+00	2026-08-19 08:57:36.850204+00	2026-08-19 08:55:15.753272+00	\N	\N
cbba720d-6191-4c5f-8bdc-5f948dfcbab3	22222222-2222-2222-2222-222222222222	d2b8a2781b43e680646ce7037b275bddeffd9b93b65e25de0da464e51e18b41c	2026-09-19 06:52:05.971316+00	2026-08-20 07:01:14.475934+00	2026-08-20 06:52:05.125173+00	\N	\N
56e3cac8-37db-4c02-8e74-77b7ce20db3d	11111111-1111-1111-1111-111111111111	b6012bcdaf2ed29d0841c4e965504ff582551e1f97df3091c7878472e7d21ee4	2026-09-18 08:57:36.83927+00	2026-08-19 08:57:39.87995+00	2026-08-19 08:57:37.281859+00	\N	\N
185e2b9a-0598-4c11-bd02-049784dd00bd	11111111-1111-1111-1111-111111111111	c07f53f72867f37e076a630d94fff3dcc87169daa3337fc37ca14b90fc397974	2026-11-08 07:56:09.060379+00	2026-10-09 07:57:30.361926+00	2026-10-09 07:56:09.30174+00	\N	\N
9f5c5e0f-fca6-476b-b93b-3bf161575fa4	11111111-1111-1111-1111-111111111111	e6d8e281d7632b0ca06f60f7195d0f9138625c6ebc40f352ef0deed73596cb14	2026-11-06 04:58:01.544428+00	2026-10-08 06:31:26.518301+00	2026-10-07 04:57:59.440387+00	\N	\N
4e8fb41b-42b0-49ab-8f18-a8dc1b95f1ff	11111111-1111-1111-1111-111111111111	23ba80685461732bd5ad3fd9f4c6c146f9c26e885cdc4af0316dd219f5013cca	2026-09-19 07:42:03.429824+00	2026-08-20 07:42:17.337299+00	2026-08-20 07:42:02.723176+00	\N	\N
281743d9-4d26-4b72-a708-019fd40ba150	11111111-1111-1111-1111-111111111111	9b69f97cebb47aeee4cb59c9416e363ee7900ff2da1d3752bebc63cc65ea2203	2026-09-18 08:54:39.223509+00	2026-08-20 02:08:24.607477+00	2026-08-19 08:54:39.245901+00	\N	\N
f9ff6ad1-6392-4bf3-abfd-da7804da4609	11111111-1111-1111-1111-111111111111	be198f31e99d804b73d3c46fa424aded003ac1d0828bc66cbf32289a783ccd04	2026-09-19 02:08:24.72993+00	2026-08-20 02:08:27.198049+00	2026-08-20 02:08:24.755697+00	\N	\N
112c3e78-dc03-4eee-9284-ee07caa4938c	22222222-2222-2222-2222-222222222222	7c5a03e98ea4056fe17c40a64fe025fd4b64113a2c5a463a9065323f45478804	2026-09-19 07:42:28.192969+00	2026-08-20 07:48:39.149323+00	2026-08-20 07:42:27.487634+00	\N	\N
6bf9088a-cfcb-42db-91fa-036629965f8d	22222222-2222-2222-2222-222222222222	e5ab26dd1952297bf7c53853132ba834e7f06b546326051e5acf3a67698a9abc	2026-09-19 02:08:34.125059+00	2026-08-20 02:08:37.85821+00	2026-08-20 02:08:34.150722+00	\N	\N
f26f1885-c9f8-41f2-b64e-b83676c403d4	44444444-4444-4444-4444-444444444440	5ae7de6d63b2730e7f3e84ed8d933a45eb6dd300914b6c747d89f1f04d591741	2026-11-08 07:57:32.064319+00	2026-10-09 07:57:39.965656+00	2026-10-09 07:57:32.309908+00	\N	\N
01035959-a88a-404a-8f9b-51e8c97fa19f	11111111-1111-1111-1111-111111111111	4dd51048d4621f7585040f925145f3f94e42231844eb1efc2470ee04c2c01acf	2026-09-18 09:21:05.928994+00	2026-08-20 06:27:45.538151+00	2026-08-19 09:21:06.433414+00	\N	\N
79fa6e1e-5210-4563-b342-890dcb34a444	22222222-2222-2222-2222-222222222222	c97382c110b9782cdc7510558708583a7ebdd98ade5c93de8468283068e198ee	2026-09-19 07:48:40.209941+00	2026-08-20 08:19:16.877131+00	2026-08-20 07:48:39.523726+00	\N	\N
526beaa9-c122-4e65-a9a5-235f689d5287	11111111-1111-1111-1111-111111111111	a699671577b7d27972d2f3ef19926cc42be9c8fda2128b16957e1e948735e68e	2026-09-18 03:14:40.099877+00	2026-08-20 06:27:46.503389+00	2026-08-19 03:14:40.186191+00	\N	\N
459166f7-1830-403d-8809-56d628ed08bb	11111111-1111-1111-1111-111111111111	d376e4e413be0cd1e214fa63e4aae6d6f67668708c3fd701f2e9a56434867d1b	2026-09-18 07:11:37.764001+00	2026-08-20 06:27:46.503389+00	2026-08-19 07:11:37.910518+00	\N	\N
6e2503b6-fdfc-4b21-8522-ca3a0b856284	11111111-1111-1111-1111-111111111111	2712df2d510a12f00eb5ddf0a13525dfd739082adb408fef4f8c1520d4a9980f	2026-09-18 07:20:05.525397+00	2026-08-20 06:27:46.503389+00	2026-08-19 07:20:05.549288+00	\N	\N
6b1da36e-0ab0-40cf-869c-6915439b22f6	11111111-1111-1111-1111-111111111111	2d49d64ad0fa9c0460c429953fcbd47c6a3f25a2a48d5a09ddbcd82fb76e2499	2026-09-18 07:20:10.328851+00	2026-08-20 06:27:46.503389+00	2026-08-19 07:20:10.352741+00	\N	\N
1c06f060-4664-499f-9bb0-28bbd79a1701	11111111-1111-1111-1111-111111111111	cb40e417906c44f395e5166c5a81d9c5b4ce80661dfd71015bcba93c867f78d0	2026-09-18 07:20:17.426776+00	2026-08-20 06:27:46.503389+00	2026-08-19 07:20:17.450757+00	\N	\N
17859ba3-6497-4307-a8fa-4be0503e0a4c	11111111-1111-1111-1111-111111111111	12878a11f5b68c695a1786a578d5657a9a4139db3b70dbbd51885e14c9c77fe7	2026-09-18 07:20:26.639605+00	2026-08-20 06:27:46.503389+00	2026-08-19 07:20:26.663545+00	\N	\N
e5926445-283b-447f-9998-e32ad4edee34	11111111-1111-1111-1111-111111111111	d44857def49638c143062fb3c0bb0b1c2731d37002d8b47e053c5ce3b414472e	2026-09-18 07:45:28.06732+00	2026-08-20 06:27:46.503389+00	2026-08-19 07:45:28.092745+00	\N	\N
d5cdb6e4-79d7-4401-8627-6367007986e3	11111111-1111-1111-1111-111111111111	f27644656ba94ce3bc0779f2a4d345e2c765f56da68afcecd76d8377de9fd8e2	2026-09-18 07:45:31.674568+00	2026-08-20 06:27:46.503389+00	2026-08-19 07:45:31.700001+00	\N	\N
1b1e1989-88dc-48ca-b827-017e82ccb1bb	11111111-1111-1111-1111-111111111111	bd40a4cad394947ccbff1dd1fb61eeee374d7032caef67a73ba577bac42c6ed3	2026-09-18 07:45:38.265775+00	2026-08-20 06:27:46.503389+00	2026-08-19 07:45:38.291251+00	\N	\N
15c726d9-a888-4665-a066-6014452143ca	11111111-1111-1111-1111-111111111111	6441413501ff1935e07964728d3301f2de47585b0f8c5d4186f266e9e4942f2b	2026-09-18 07:47:35.365878+00	2026-08-20 06:27:46.503389+00	2026-08-19 07:47:35.391576+00	\N	\N
26f5d5b3-3644-4a20-b569-362aa01a5c9d	11111111-1111-1111-1111-111111111111	225a0cedb0e3ebf73d543f8d0352c6c4932e1c532fb600935c25c58218cd1a7d	2026-09-18 08:09:03.871468+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:09:04.183885+00	\N	\N
e86293b3-60ab-4b6e-9ce8-c66bcdabadae	11111111-1111-1111-1111-111111111111	89f528f2338d6cf57330d9f8f049aa8e31215fe1749d235ae3a8373ab1dcc77b	2026-09-18 08:18:32.029394+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:18:32.372201+00	\N	\N
0a59fa57-9481-42d9-ac86-7849a826c8c5	11111111-1111-1111-1111-111111111111	3625f5b07c51cece0d5f6dfef8cdf2c1d22c8662183e199caecdabcf80323f86	2026-09-18 08:18:39.530894+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:18:39.870379+00	\N	\N
944315fd-216b-4aea-b9b0-2380e3df1ef9	11111111-1111-1111-1111-111111111111	90f15daad9cb375f980bbc958bd9141f5919e3592c0e658d774b259159363671	2026-09-18 08:21:46.204478+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:21:46.554859+00	\N	\N
d5c74741-dab7-487a-a496-4d3a0ce3a14b	11111111-1111-1111-1111-111111111111	58ac197652fd5a68d36be61e6cdb6eaf3649cadccf0ea05d62ab40ce7196a25c	2026-09-18 08:23:11.962889+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:23:12.311653+00	\N	\N
9e50ae32-5f7e-4c9f-9100-3910202bfd9b	11111111-1111-1111-1111-111111111111	82b19c75636a42328b288987eb4bdc056c0236780c20093acede16f453c93a94	2026-09-18 08:28:14.830601+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:28:15.196871+00	\N	\N
6c9f4dd9-1d35-4c84-a48f-f2f4a98463ee	11111111-1111-1111-1111-111111111111	03cbf25aa103a5cfe9cbcd681e77db1df47d3716d68460d2ec168c92a4eab3b6	2026-09-18 08:33:40.277288+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:33:40.656312+00	\N	\N
2a12d5fc-35f2-4d71-b97a-baeb9a81cd14	11111111-1111-1111-1111-111111111111	7d6887b96c14e8324dc7ffc55d80e65a3f7c55db6485df1be71474c3aa10db63	2026-09-18 08:41:48.996586+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:41:49.391215+00	\N	\N
2f4f6772-9292-486f-bb38-fddaac8d372b	11111111-1111-1111-1111-111111111111	b1bfb83c26392f845c34e9dadfcee304431cf090d68b61b2b86baa8c4c910ee1	2026-09-18 08:44:28.791127+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:44:29.193467+00	\N	\N
2b491698-6a45-48a5-99b1-66a460c19150	11111111-1111-1111-1111-111111111111	1ec3c041019f06f3c36dd2105477d22b935779596c056308def9198ff6b4fdf9	2026-09-18 08:57:36.801796+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:57:37.241829+00	\N	\N
fdc27374-b003-44f6-8c69-acd2cfa9bf9e	11111111-1111-1111-1111-111111111111	f2f06338c3a9d595423c67c2df8db3e3055597cf4c7611e70996e41b223dbbce	2026-09-18 08:57:39.807453+00	2026-08-20 06:27:46.503389+00	2026-08-19 08:57:40.246951+00	\N	\N
089b9adf-cf3c-48d3-a833-13e5e6b8b840	11111111-1111-1111-1111-111111111111	bf38f5521bc204e97b8bd71192350af82b604b4587c152733c0323d6fb6d2e34	2026-09-18 09:21:05.878266+00	2026-08-20 06:27:46.503389+00	2026-08-19 09:21:06.379827+00	\N	\N
d3046f8e-f30f-487e-b333-2b77bdebb35b	11111111-1111-1111-1111-111111111111	635edf94da80517a23458e6cfff65becc897f21ab55bcf03236d527c508516a9	2026-09-19 02:08:44.323802+00	2026-08-20 06:27:46.503389+00	2026-08-20 02:08:44.34877+00	\N	\N
38f3930e-2481-43f1-9446-75da6e765cdd	11111111-1111-1111-1111-111111111111	40bf46b70837f13c62ea2115d9d664a310b344d2f73580588da1802df5aa3eac	2026-09-19 06:27:46.831712+00	2026-08-20 06:27:46.503389+00	2026-08-20 06:27:45.922165+00	\N	\N
3463ee40-d400-4377-9348-e1b5f6639014	22222222-2222-2222-2222-222222222222	895add71a88da46d45647640f1ae48a29af1c1feb81cea85b1d37244ddc70809	2026-09-19 06:27:50.944531+00	2026-08-20 06:28:07.602809+00	2026-08-20 06:27:50.035866+00	\N	\N
e21cf87f-4655-491e-b4cf-eb1de5efffcf	11111111-1111-1111-1111-111111111111	38b01ec27a46a46cdfe489829a20a0cfa2588542c6ebcd71d32bbea75d52e225	2026-11-08 07:57:41.906181+00	2026-10-09 08:13:05.58092+00	2026-10-09 07:57:42.151786+00	\N	\N
972e0c1e-f8a4-4bff-9aed-9f6efc1079b5	22222222-2222-2222-2222-222222222222	6ff596de0437eb426e32663241c14464b520ad0dd859d57273aa4e64488fd93b	2026-09-19 06:52:05.561488+00	2026-08-20 08:19:17.821348+00	2026-08-20 06:52:04.715923+00	\N	\N
d6b67b70-1cc5-49de-8eba-4936483da81b	22222222-2222-2222-2222-222222222222	aa754c7b9072a364c20017189993ae233a0c7150b1207965823b7b08c10f2c53	2026-09-19 08:19:18.413003+00	2026-08-20 08:19:17.821348+00	2026-08-20 08:19:17.282617+00	\N	\N
ef7d7993-9bd5-4cd0-920b-0b09468e961b	11111111-1111-1111-1111-111111111111	e69c76209a7d6e43d97ca6aa273c19144b4a31e68f8fd17807efc3218d4b67c6	2026-09-19 07:42:03.41926+00	2026-08-20 09:12:15.944887+00	2026-08-20 07:42:02.71247+00	\N	\N
7fe79a3b-0f05-40e3-be63-9c417519a540	33333333-3333-3333-3333-333333333333	82a1ab09202e086ee5fb18291a41ab6ffada3da79b2b64441b56443dc72cc8d8	2026-09-19 09:12:44.291132+00	\N	2026-08-20 09:12:43.259592+00	\N	\N
8a611627-5a96-41d0-a5e0-87c8d6afc50b	33333333-3333-3333-3333-333333333333	c7fc2e1f0c55bfa3d0b679ad9ff06423f7a4d377ea888a8ad3fc1cfa88af7c26	2026-09-19 09:14:01.558782+00	2026-08-20 09:23:34.056498+00	2026-08-20 09:14:00.531794+00	\N	\N
2f974e58-28d9-41f4-96e8-2ee0e297f3b3	22222222-2222-2222-2222-222222222222	ae48cb1766443319f88b86c128f649bf666174b237b49d84fb8603f7ca1b6035	2026-11-08 08:21:09.120693+00	\N	2026-10-09 08:21:09.436279+00	\N	\N
8c1d432e-fdfe-4593-adf7-c3b5c4d11638	11111111-1111-1111-1111-111111111111	bbb56c0ec1ade21bda8626a487d54ba5f7b745b58778c5edaff59c897b3ccf94	2026-11-05 04:06:09.550481+00	2026-10-06 04:30:54.351196+00	2026-10-06 04:06:09.573148+00	\N	\N
7f6361d8-e7fb-499e-b1da-67c83f7f805e	44444444-4444-4444-4444-444444444444	2adf54a72e25e541290384e8e835e8a32f1640e0070a330f66e47aa0361f2332	2026-11-06 04:16:53.041946+00	2026-10-07 04:22:24.349674+00	2026-10-07 04:16:50.826459+00	\N	\N
cdededcc-ec61-4c14-9e92-ef8bda134de0	11111111-1111-1111-1111-111111111111	340f93f81cfbffd5e50667904d5e8ba1ea5b0d64599b922dc2179c73c6770877	2026-11-08 08:22:28.653986+00	2026-10-09 08:28:20.076955+00	2026-10-09 08:22:28.973207+00	\N	\N
c223fa00-ec5b-440b-9128-ac7b99733a94	11111111-1111-1111-1111-111111111111	09e66237fc5018cdd415f8fdfc261b987349abc67c06c7b135481235248f527c	2026-11-08 08:21:07.212746+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:21:07.526913+00	\N	\N
89026413-c23a-4ff3-8a20-d5be6ac9f9c3	33333333-3333-3333-3333-333333333333	03502c99b3863b61da643be2d19ba56ade14114c6967f098f93bcb07641fa867	2026-11-07 04:25:52.337955+00	\N	2026-10-08 04:25:52.494068+00	\N	\N
dad791a4-b611-4324-bd2b-90f8053687ef	44444444-4444-4444-4444-444444444440	a00cd4d8b21d2074413a3f44cf29b0e549db81905f3dcf2d7ff752a04286c200	2026-11-06 06:17:50.697859+00	2026-10-07 06:18:50.237218+00	2026-10-07 06:17:48.874072+00	\N	\N
d01c1401-c1b9-49e2-a075-e47fe37cf3d9	44444444-4444-4444-4444-444444444445	2c18f1007d28ddb6e38e652b275488994166b3a651a0d7f88b47bd7ed953757f	2026-11-06 06:18:53.99314+00	2026-10-07 06:19:20.115257+00	2026-10-07 06:18:52.164634+00	\N	\N
3c4154d7-a125-4c38-be23-4ea0b9df7e5d	11111111-1111-1111-1111-111111111111	881bc26875cb19451aea4ea5f1adeb2ce842b2d4cd2b6e545cd50254eb12c375	2026-11-07 04:50:21.598591+00	2026-10-08 05:05:03.47459+00	2026-10-08 04:50:21.82335+00	\N	\N
982f1076-be1e-412c-9b90-97ca458c5c12	22222222-2222-2222-2222-222222222222	01a6375aa529960274625a54b9a5bf9b117c5cb724cb28ced7b442c5f9cfc9d9	2026-11-08 08:03:47.007894+00	\N	2026-10-09 08:03:47.282256+00	\N	\N
6e18b5ff-761d-4bfd-b006-33074ed6cc46	11111111-1111-1111-1111-111111111111	e7381baee90b5aa95172ca9b676773e8a655e3dcfcb0c26699afbd3d6312364d	2026-11-07 05:05:03.420053+00	2026-10-08 05:06:16.070245+00	2026-10-08 05:05:03.686635+00	\N	\N
0d956da9-cf09-4985-8279-1bfd87de9545	44444444-4444-4444-4444-444444444440	b3a88b3009358ad1fdefdc30aee66dc251e7a4392d801c1e2c8175d4f41677d7	2026-11-18 06:24:46.598825+00	2026-10-19 06:42:51.380853+00	2026-10-19 06:24:46.302359+00	\N	\N
12c1c7d2-5387-4dd3-94f6-534797bda183	44444444-4444-4444-4444-444444444446	0389c01c7652bdd2bad563a11cddd526a475cfbd9799de5566e23160c6b7b1f2	2026-11-06 06:19:23.580858+00	2026-10-07 08:17:01.492218+00	2026-10-07 06:19:21.75338+00	\N	\N
64bde885-8444-45cb-ba4c-c489107c6477	11111111-1111-1111-1111-111111111111	650bba30b04de7ee2bea48e02d62b2b2ec6e506fb1a4e8b1f01e90bd0333a18a	2026-11-06 08:37:45.138238+00	2026-10-08 06:31:26.518301+00	2026-10-07 08:37:43.707076+00	\N	\N
2f4140ec-1b1e-49e5-b582-498441310fda	11111111-1111-1111-1111-111111111111	1d0c906a2a70e88c197b068ff5154cc776af274c844ff355d1d61cf7c9c34b52	2026-11-06 08:38:33.812942+00	2026-10-08 06:31:26.518301+00	2026-10-07 08:38:32.383844+00	\N	\N
d31afdb1-4ca1-498e-b8da-93ea9758425b	44444444-4444-4444-4444-444444444446	30f7df914c832404769bb9682946f2f9026fc16c95b7f3076698552ec3b68ccc	2026-11-06 06:44:50.562778+00	2026-10-07 08:17:02.733842+00	2026-10-07 06:44:48.804917+00	\N	\N
a9572751-b634-4636-87ea-bf40e3c6bd4c	44444444-4444-4444-4444-444444444446	ccbdf9b8e437d995b8d3c07484e8c22c48d563fb86047afef8451e0cdd87315d	2026-11-06 06:57:53.118923+00	2026-10-07 08:17:02.733842+00	2026-10-07 06:57:51.397647+00	\N	\N
cc422191-f16f-46b8-b900-d006b2c222a4	44444444-4444-4444-4444-444444444446	3566cf1910f566962a8fee4a49478fc038bc07194b74521acfb306e6aeceabbc	2026-11-06 07:11:28.214939+00	2026-10-07 08:17:02.733842+00	2026-10-07 07:11:26.533323+00	\N	\N
1b628f22-5825-476b-8593-0244f745294b	44444444-4444-4444-4444-444444444446	84f68e25ac9fda6155cd30e8a59fc4c427ff3247ba14218874862c0f13c3e2cd	2026-11-06 08:17:03.186157+00	2026-10-07 08:17:02.733842+00	2026-10-07 08:17:01.689138+00	\N	\N
0b7a6473-8717-41df-80da-36ae9990f76c	44444444-4444-4444-4444-444444444446	7d3249f6f05c18d5b09c9078739b1cb18fce6b67cf0354cd3ac2f806bcc86dfa	2026-11-06 08:17:03.239488+00	2026-10-07 08:17:02.733842+00	2026-10-07 08:17:01.753317+00	\N	\N
80ee0ce8-36d4-4eb3-8236-14b8d5bddd61	11111111-1111-1111-1111-111111111111	22e2ca311fc3aa86e53a1eb9b87d16e199aaad792cbeeaed42e8ea16e0ced438	2026-11-06 08:40:57.251197+00	2026-10-08 06:31:26.518301+00	2026-10-07 08:40:55.821838+00	\N	\N
d66962ef-6631-458d-b3ab-076cd61dd0a0	44444444-4444-4444-4444-444444444445	1296c0457c40e83bd3382626c1cd9f39760341d37fcc8d386060cd1e4a8ca3af	2026-11-06 08:17:06.264951+00	2026-10-07 08:33:26.520029+00	2026-10-07 08:17:04.77602+00	\N	\N
dc01d334-a77e-4151-8fa9-b954981edd79	11111111-1111-1111-1111-111111111111	b49584d5ca7dec0e83c73e6a3703050b1b6f3d4c348590dafa555cb0f184a1bc	2026-11-06 08:41:39.59153+00	2026-10-08 06:31:26.518301+00	2026-10-07 08:41:38.175035+00	\N	\N
aa135eff-c0ad-4703-b265-accbb3f40414	44444444-4444-4444-4444-444444444446	351054afb7fe1a04633d4461fb7c656d98a66c17b5f2a9c283226efb38a27436	2026-11-06 08:49:31.753433+00	2026-10-20 03:07:43.743056+00	2026-10-07 08:49:30.347913+00	\N	\N
9a67fd47-2d93-4c09-aee9-a085c5636b59	44444444-4444-4444-4444-444444444445	4378b668ef18f6bc516b617a0f25ec055ba0d3d03c8eea4452728dd5f838ed4a	2026-11-06 08:33:28.169459+00	2026-10-07 08:44:24.464892+00	2026-10-07 08:33:26.726035+00	\N	\N
d50447e6-457a-4a80-a3ce-5c8138d43b2c	11111111-1111-1111-1111-111111111111	396b87a877b2b1cceaac1fd8f84e885af7dc8e014a8d92484d21b6fbb17ebe4f	2026-11-06 08:42:50.572507+00	2026-10-08 06:31:26.518301+00	2026-10-07 08:42:49.148233+00	\N	\N
92f9270a-9a36-461e-932d-612d09c8ff39	44444444-4444-4444-4444-444444444445	e3f084f4d61b12c3a221d95433a5d8712a0dffb0441da0b038ce9d6b2e75dd85	2026-11-06 08:44:26.122395+00	2026-10-07 08:52:26.466537+00	2026-10-07 08:44:24.713759+00	\N	\N
471fdd87-dc2a-4441-8743-6d2caefb2635	11111111-1111-1111-1111-111111111111	0e5d83ba16afd755aec7f2bd46fda0b84885d2886bc50949b3eeeb5ab992c10e	2026-11-07 06:25:38.660756+00	2026-10-08 06:31:26.518301+00	2026-10-08 06:25:38.213856+00	\N	\N
a9ea4372-b64e-4ad1-bb82-bb7568f8b34f	11111111-1111-1111-1111-111111111111	510d2683d3ca7562d9f150db1001f8393ed8c718b88a3c13bd8fc50b3cf0f29f	2026-11-07 06:47:07.935319+00	2026-10-08 07:07:07.125881+00	2026-10-08 06:47:07.543566+00	\N	\N
81d4bfdd-279e-4eeb-8f0e-34fcc58845e9	11111111-1111-1111-1111-111111111111	ff9da2b801b261ae8121dc861bd83db2313c31679520856bfef611f746b53523	2026-11-07 07:07:21.355115+00	2026-10-08 07:16:19.162757+00	2026-10-08 07:07:21.802952+00	\N	\N
a1169d42-cd95-47c0-91ab-7d3135621428	11111111-1111-1111-1111-111111111111	5c777e6d527169472bac83560e5745e547b219135556702f943de98e5e8efbf6	2026-11-07 07:24:04.292969+00	2026-10-08 07:54:51.056277+00	2026-10-08 07:24:04.339287+00	\N	\N
293f8053-0624-4bb0-b1e8-3e17ac2ebbb7	44444444-4444-4444-4444-444444444445	81c76d889f6c2dddb360e8ab40f0a2144a0db5d254318bb63ddf36ddf028753c	2026-11-06 08:52:28.149265+00	2026-10-07 09:32:35.988958+00	2026-10-07 08:52:26.753615+00	\N	\N
2bcdbf1f-a75b-4c3c-b1f0-47bb272f09cd	44444444-4444-4444-4444-444444444445	f60530773c993c86d63a9107dda3d6c10ded9dd063384bc05f8c83d4f1270ad6	2026-11-06 09:32:37.597391+00	2026-10-07 09:32:39.063739+00	2026-10-07 09:32:36.311443+00	\N	\N
5edde76b-393c-4b05-b4c2-84c4bee16e33	11111111-1111-1111-1111-111111111111	c9fc8c7eac3e1e83334a48a6525eb61559a693b9bf7da3f3e799921bc606518b	2026-11-07 08:25:41.256106+00	2026-10-08 08:36:12.723851+00	2026-10-08 08:25:40.97189+00	\N	\N
c3c63c42-e533-4283-9057-393d1dc8016c	11111111-1111-1111-1111-111111111111	ab5aac3c7c3b9ea77b99623310d87300f1ad12a5c907118dc7c077a690221145	2026-11-07 08:24:05.938677+00	2026-10-08 08:36:13.158868+00	2026-10-08 08:24:05.650545+00	\N	\N
42d58a74-7f85-4d19-b16c-29486bec27ff	11111111-1111-1111-1111-111111111111	5d8c3098b94303e81185fa5169b1371ac7f5f45c4a055e5487bc6a2f06794079	2026-11-07 08:25:41.249107+00	2026-10-08 08:36:13.158868+00	2026-10-08 08:25:40.965376+00	\N	\N
3daf4761-c82d-4942-94d5-ed431ebfbead	44444444-4444-4444-4444-444444444440	32f2baa6f3926b68acce96a3efafe2414236ac703109cb2cf7aaf9188d161fc2	2026-11-06 09:32:42.474036+00	2026-10-07 09:43:33.922317+00	2026-10-07 09:32:41.187829+00	\N	\N
9f570751-4d2d-43c8-b7ff-6be7e0491538	44444444-4444-4444-4444-444444444445	f53f5aa9d863474f0cb2ec0236078709b4eef662177a430401cd977f807923ea	2026-11-06 08:44:26.0737+00	2026-10-08 09:47:58.085095+00	2026-10-07 08:44:24.653818+00	\N	\N
b32a3427-c06c-4e91-8687-fff9a88eb89f	44444444-4444-4444-4444-444444444445	5b55da632e9ea76516b660703300e523b8c2d949522e518b93717b215a7c361f	2026-11-06 08:52:28.047608+00	2026-10-08 09:47:58.085095+00	2026-10-07 08:52:26.650643+00	\N	\N
513071de-012f-4624-8241-9abf510cf5a5	44444444-4444-4444-4444-444444444440	b9b31a1fd6485e530816ba55e82d3602adf3fd4138c5bdfd94689e8691b66ea9	2026-11-06 09:43:35.411489+00	2026-10-08 04:06:22.434532+00	2026-10-07 09:43:34.1666+00	\N	\N
7942423d-e0bd-4f1d-96c2-e89e31cd167e	44444444-4444-4444-4444-444444444440	cef0455ab2b5af09ad8a1b51a19b28e65ab7e991e5aa02351131366165ebdf85	2026-11-06 04:58:50.620264+00	2026-10-08 04:06:22.930107+00	2026-10-07 04:58:48.519119+00	\N	\N
d70f56c8-96a7-4467-889d-0f36ba56928e	44444444-4444-4444-4444-444444444440	78a22d333808a7f1b8698c9d9e45bb2092c28635b0489aa29eb50f5c171180ad	2026-11-06 04:35:31.968977+00	2026-10-08 04:06:22.930107+00	2026-10-07 04:35:29.804979+00	\N	\N
dd51e33d-6b23-4b0b-b191-c065f2de57fd	44444444-4444-4444-4444-444444444440	fec235cc0d7a0385853f23203217e303826df654f229f08e7745dbc9e5bd2b24	2026-11-06 04:35:40.253483+00	2026-10-08 04:06:22.930107+00	2026-10-07 04:35:38.090735+00	\N	\N
bf5222ea-b02e-47e9-b9cf-3c4ed9cba522	44444444-4444-4444-4444-444444444440	a69d057a031e1c2aa3c91737feccc5b783a6859a0a1d95866294844fd0c2ab74	2026-11-06 04:35:47.220662+00	2026-10-08 04:06:22.930107+00	2026-10-07 04:35:45.05771+00	\N	\N
633e2cc1-699a-4db3-a9aa-112da9495a8c	44444444-4444-4444-4444-444444444440	ae3c95be6f2d978c8042278f6403d7d10c60f31a3aaacbf38a862ad05b62ce69	2026-11-06 05:01:33.763452+00	2026-10-08 04:06:22.930107+00	2026-10-07 05:01:31.679724+00	\N	\N
46c0b6e4-7620-42e4-908f-722a6b70dd8f	44444444-4444-4444-4444-444444444440	76b78eef50f9639194bf744ad0ba75316a06d84c25da35295f7016777008fef1	2026-11-06 05:07:50.10375+00	2026-10-08 04:06:22.930107+00	2026-10-07 05:07:48.026211+00	\N	\N
cbdedf88-a8f3-42cc-99ea-d0c24e3cded6	44444444-4444-4444-4444-444444444440	47f675b3250c8c6f804124740e8a23adcb8e3e7b352d23b293208f679881ac9e	2026-11-06 06:17:50.620294+00	2026-10-08 04:06:22.930107+00	2026-10-07 06:17:48.788268+00	\N	\N
e408df79-febb-4156-ae28-2d1ecace0c10	44444444-4444-4444-4444-444444444440	2c765d24c05e5815dcde42c2cfdc9564b84874ce5fbc5c8c25f92b28475ebace	2026-11-06 09:04:44.165164+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:04:42.802465+00	\N	\N
9183580f-97ae-40df-8abf-3fe4834abfbc	44444444-4444-4444-4444-444444444440	a89dc00f281ba587fa23384b21a7e27e11fad7f582bbca7844d11253b6ae5c58	2026-11-06 09:04:54.840164+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:04:53.478126+00	\N	\N
b996da6b-cbcd-40f7-8c96-6dfe0dd79406	44444444-4444-4444-4444-444444444440	393850d2a04514fadcb6cd9b84dfa3df8d524e186e7248432c456d0a901075cd	2026-11-06 09:10:41.947543+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:10:40.609735+00	\N	\N
72d41e48-5288-4c5e-aca5-153725960648	44444444-4444-4444-4444-444444444440	6a65cb79103757beb5705e9777dbbd74066ca269f2e441196d7b1a337b98cb34	2026-11-06 09:11:19.67646+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:11:18.334243+00	\N	\N
2172ac4a-6829-4c03-867b-2a65f3c8bd0f	44444444-4444-4444-4444-444444444440	ae5c87e48fe12a632047d0da2e8585b88f1beb6f74ef341eb23eaf19ae66b8df	2026-11-06 09:11:35.467192+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:11:34.132004+00	\N	\N
3a3c4748-2a49-421b-9fa6-306d85e6f989	44444444-4444-4444-4444-444444444440	8311af002d304ca5fff7c9b8e891c7fc37e72bc9d51501926cdeb72ea0a844ba	2026-11-06 09:17:36.112323+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:17:34.794303+00	\N	\N
f7f6fbfa-fc00-49e1-913c-133869675a3e	44444444-4444-4444-4444-444444444440	8d3fcc7ba273ad13adb2e87edd3726005e671d5e38bdbd9cccf04e133ecef179	2026-11-06 09:17:51.805699+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:17:50.488953+00	\N	\N
c4ab978d-2db1-4ac6-ac7c-d195cfb8e7f8	44444444-4444-4444-4444-444444444440	d2fc1de6409aebd26a2df2012e480c45ef76f9e3e37e7249b2fed59d4dcb2c50	2026-11-06 09:40:30.596921+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:40:29.333232+00	\N	\N
6796c819-421d-496d-97ae-770dfc3ccc2b	44444444-4444-4444-4444-444444444440	22d40bf14df14c4e674393f3030a6e964cca0060b71a1ada463582ccac056f54	2026-11-06 09:40:38.668264+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:40:37.404881+00	\N	\N
73189aca-e9da-421d-89c7-bc283abcfc6a	44444444-4444-4444-4444-444444444440	f1477501897a9ac3a94e0a8ac59dcad6d1914af00338088a8dd4e3cecdaea46a	2026-11-06 09:40:52.208935+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:40:50.956323+00	\N	\N
c48b395c-3652-4c80-a07d-f3346b1c7a41	44444444-4444-4444-4444-444444444440	f5aef56cb049ff627cd7bc8c0995f4d3d053722a55444236f8fbb93e541cf735	2026-11-06 09:43:35.374352+00	2026-10-08 04:06:22.930107+00	2026-10-07 09:43:34.119062+00	\N	\N
c44dbc9c-75d8-491f-a4fe-03b66e984830	44444444-4444-4444-4444-444444444440	f7043f75c6c964ae06f4d83b26fa24c5500780ba2f62a1e56f7b10e09b3925bc	2026-11-07 04:06:22.564485+00	2026-10-08 04:06:22.930107+00	2026-10-08 04:06:22.665565+00	\N	\N
cd170034-b06b-4380-ae2a-51a611409505	44444444-4444-4444-4444-444444444446	e86dfad90ebb66e6b35c0bfae7303303ee6355740d0baf3ef48c5fa1fceb6872	2026-11-07 04:07:07.651801+00	2026-10-08 04:09:25.810596+00	2026-10-08 04:07:07.755955+00	\N	\N
18719b21-d9bf-4f41-98f8-5a8a939490bb	44444444-4444-4444-4444-444444444444	ca8e07c02524f2113cfb5603bfa1116c500695364748db0e297437172a950849	2026-11-07 04:06:27.694585+00	2026-10-08 04:06:52.527715+00	2026-10-08 04:06:27.807164+00	\N	\N
3d083dca-d1ae-4d51-a106-3a0cfa0cafb5	33333333-3333-3333-3333-333333333333	43b4350716c367dfad662a69fb90e0a34ac2aad3569a2166ae8b81faa66fdc24	2026-11-08 08:03:49.966543+00	\N	2026-10-09 08:03:50.231365+00	\N	\N
ef99c3bc-a7c3-4d7f-ab6d-55c0172338f2	44444444-4444-4444-4444-444444444445	0f831404cd5d5bfbd1c022c0f14f8440fe9a7077e792d135431507f311144f8f	2026-11-07 04:06:55.876885+00	2026-10-08 04:07:06.232583+00	2026-10-08 04:06:55.979196+00	\N	\N
04613a03-c533-4c62-96b9-39617afba28d	33333333-3333-3333-3333-333333333333	f122a121285863ed89ff90e4dbf53db5bf9c9ca58d505d11293d29d6286d2bc3	2026-11-08 08:21:12.067248+00	\N	2026-10-09 08:21:12.38173+00	\N	\N
bcfea38f-96eb-49bb-8eed-db2ecfe1ab2d	44444444-4444-4444-4444-444444444440	183615d9c183727401b092334d3a149e30c877fb43f9dce1a2847ea8d143f7fc	2026-11-18 06:42:51.843237+00	2026-10-19 07:19:25.206692+00	2026-10-19 06:42:51.582194+00	\N	\N
02fab243-bd99-48b9-bdeb-203bb3a1954f	11111111-1111-1111-1111-111111111111	54ddad58695e371462ee395e5fa2c2a3d49af1b14b3626abd093def7f08f8ba5	2026-11-07 05:06:16.286896+00	2026-10-08 05:21:50.505498+00	2026-10-08 05:06:16.557019+00	\N	\N
61c1e8df-6fed-4f24-9d29-f06f7348d335	11111111-1111-1111-1111-111111111111	ce51dfd5339accfbc8a470ca163d39b19ccb126ae380bb7ea94b9fa35acd20bc	2026-11-07 05:21:50.399196+00	2026-10-08 06:25:35.956163+00	2026-10-08 05:21:50.713549+00	\N	\N
5cb8db6c-b52c-4992-a285-e0df4228c1c2	11111111-1111-1111-1111-111111111111	619a6db583d5475d3177e99cfd89f8ec4c4367120f5b72c757c48152f4274311	2026-11-07 06:25:36.680644+00	2026-10-08 06:25:38.002827+00	2026-10-08 06:25:36.234167+00	\N	\N
9eb1638e-d4a4-4482-892a-7b3028701c6f	11111111-1111-1111-1111-111111111111	e03a713aa15d2b1c70b7c188ff60964b24fdea30ec2ae2ce6d7764836ba946dd	2026-11-07 06:25:38.664684+00	2026-10-08 06:31:26.128168+00	2026-10-08 06:25:38.218015+00	\N	\N
9e8d84e3-9767-4cdc-ac2e-2d2e14a66505	11111111-1111-1111-1111-111111111111	61f297563a4cb3eaed978c6d15b1cb3e6d77b28ca4ec38efc95bf63ce3ae879e	2026-11-06 04:19:30.822289+00	2026-10-08 06:31:26.518301+00	2026-10-07 04:19:28.621+00	\N	\N
2b3fc2c5-0f56-440f-8fbc-9b2fef72216b	11111111-1111-1111-1111-111111111111	ab73b19ad95429252e80688dce194b4f1741c4f1bafd2341d604a2fced810ff6	2026-11-06 04:20:26.287629+00	2026-10-08 06:31:26.518301+00	2026-10-07 04:20:24.089606+00	\N	\N
6737ac77-c721-4b75-840f-bb9cfa76fe1a	11111111-1111-1111-1111-111111111111	020698f2e1976109b8bd4fa9494d60b6aef8dd81ec1634b3c805bd1811a3bee3	2026-11-06 04:58:14.242158+00	2026-10-08 06:31:26.518301+00	2026-10-07 04:58:12.138671+00	\N	\N
6d22d98f-6247-4e1c-8cef-a27a789369cd	11111111-1111-1111-1111-111111111111	b867b4b5a0d372f5526b3d01ef8272e2792bfcf5cc3f602500cc7200dfa9de3c	2026-11-06 04:58:18.23791+00	2026-10-08 06:31:26.518301+00	2026-10-07 04:58:16.134314+00	\N	\N
09cc1c6b-3a30-4cbf-ac37-177eeb49b4da	11111111-1111-1111-1111-111111111111	63495c17310524f3e9190ed0ab72c969324ec435bd8a4caeb295c4ced04c2319	2026-11-06 04:58:30.945352+00	2026-10-08 06:31:26.518301+00	2026-10-07 04:58:28.853335+00	\N	\N
ba47f7f0-d2a5-4baf-a36a-376947f4ec09	11111111-1111-1111-1111-111111111111	bd544afb97c8510e1b023554666e7e3179815af84035c4d3c65ab2bde6939636	2026-11-06 04:58:39.832862+00	2026-10-08 06:31:26.518301+00	2026-10-07 04:58:37.740984+00	\N	\N
0b3f388e-c11d-4afb-8696-7d200a61a6bd	11111111-1111-1111-1111-111111111111	b4aad9afc12e92360ecab0a3f1c541523478fa65c3e453efb712609820e9ae76	2026-11-06 04:58:45.141697+00	2026-10-08 06:31:26.518301+00	2026-10-07 04:58:43.050499+00	\N	\N
56832b60-0313-417b-9ce1-49cb8ce29b70	11111111-1111-1111-1111-111111111111	7b65a1e8af300339d75982984cd9552abd7dd29f6635b776e1d6d6669d44cf96	2026-11-06 04:59:19.142375+00	2026-10-08 06:31:26.518301+00	2026-10-07 04:59:17.041762+00	\N	\N
4386847e-9cb7-4487-9121-c1d0fb9deb7c	11111111-1111-1111-1111-111111111111	2f28e49e0ff6c9aa0139f4997dab66209a2346cf137caf8928419c37219bc588	2026-11-06 04:59:30.744596+00	2026-10-08 06:31:26.518301+00	2026-10-07 04:59:28.654918+00	\N	\N
d991662a-2426-44ad-b542-9bb47da0128e	11111111-1111-1111-1111-111111111111	b2c04da93226a565f1c764067794e059adc3950e4c86c998a0441c4455512ea0	2026-11-06 05:01:46.700247+00	2026-10-08 06:31:26.518301+00	2026-10-07 05:01:44.60715+00	\N	\N
97512834-394f-4c03-a711-ed49fb57ed2a	11111111-1111-1111-1111-111111111111	35b32cb0bd59d341c7462e58790c7365ab5678c3260d1101ad684427b4203cef	2026-11-06 05:32:54.356711+00	2026-10-08 06:31:26.518301+00	2026-10-07 05:32:51.885591+00	\N	\N
c167c7bf-b250-4123-b02f-aa84b8896280	11111111-1111-1111-1111-111111111111	88c65fc6cb2581c42c1306bcc5d905928c9e7c1e7c2d99a4a081ccb3e5236702	2026-11-07 04:25:19.279842+00	2026-10-08 06:31:26.518301+00	2026-10-08 04:25:19.445034+00	\N	\N
37aa08eb-a1b0-4644-96a9-77a688285fd9	11111111-1111-1111-1111-111111111111	2c36916c5e630ab76139a33a3aa69db12397f7a937442fc0ab5554192f330a38	2026-11-07 04:25:25.0608+00	2026-10-08 06:31:26.518301+00	2026-10-08 04:25:25.217185+00	\N	\N
8c4aecdd-6dc3-4d6c-a3f3-c95ebf9fe9e1	11111111-1111-1111-1111-111111111111	9e6e31545d818e7f80d03bae6f21e93f107df0063dba08757131411ac9498575	2026-11-07 04:26:23.548882+00	2026-10-08 06:31:26.518301+00	2026-10-08 04:26:23.71714+00	\N	\N
26f31886-5c9d-4efb-afff-42f577fbdfc6	11111111-1111-1111-1111-111111111111	afad41a5c6ec99e18fde287dca410fe558662c7cc573078b3cfbf4a6d4724d0e	2026-11-07 05:05:03.414466+00	2026-10-08 06:31:26.518301+00	2026-10-08 05:05:03.681005+00	\N	\N
d8cfc15f-3511-41d7-86c1-9fd73322bd48	11111111-1111-1111-1111-111111111111	a5f59a477dab5dc01bd7cd0a2be317635bb250500afcc9fd36ab25a5ab6ce3b4	2026-11-07 05:06:16.019919+00	2026-10-08 06:31:26.518301+00	2026-10-08 05:06:16.301083+00	\N	\N
36da89ed-2359-44e0-91f5-9629c84f96d2	11111111-1111-1111-1111-111111111111	bd88878625b17d63ce2813fefab6c7f4aedef57a27fee8c4c8987cb9d97e1fbb	2026-11-07 06:25:36.611749+00	2026-10-08 06:31:26.518301+00	2026-10-08 06:25:36.154465+00	\N	\N
4e354956-c008-4847-a4f1-ab29bb7777bb	11111111-1111-1111-1111-111111111111	d26eb6b29458b4eed1b4d301184eb403d6ea2cebd79fad4000ce458abdfff060	2026-11-07 06:27:31.009685+00	2026-10-08 06:31:26.518301+00	2026-10-08 06:27:31.051078+00	\N	\N
c377a3e4-c88e-421e-9c16-5bb50894fb73	11111111-1111-1111-1111-111111111111	38cec9697c2f80f7db8be91c3cbbe921278e64d784e0b24d1e1609fa945e0304	2026-11-07 06:31:26.764965+00	2026-10-08 06:31:26.518301+00	2026-10-08 06:31:26.336246+00	\N	\N
a76553eb-98ac-4138-9cfe-890a84ab3a61	11111111-1111-1111-1111-111111111111	78029125dc69c259f15541bad1b2c93a5223bc572449181dc2a50ffa80c58631	2026-11-07 06:31:29.895502+00	2026-10-08 06:47:07.351573+00	2026-10-08 06:31:29.456715+00	\N	\N
dde0e9ef-a3d5-4f31-9625-9ea1fb109bfb	11111111-1111-1111-1111-111111111111	c207a286bd8529410df63368de6ff1cc2a301cf665267d55e35f4db553d0fa16	2026-11-07 06:31:29.421245+00	2026-10-08 07:07:07.125881+00	2026-10-08 06:31:28.992669+00	\N	\N
04547c94-5b92-4097-a25a-712ea15a8869	11111111-1111-1111-1111-111111111111	04f4c18f43744c41ec6d6c8cef82b9516e9acb7737c696d26c9dbfac5295effe	2026-11-07 07:16:18.888864+00	2026-10-08 07:16:19.581616+00	2026-10-08 07:16:19.352284+00	\N	\N
d193c514-e3ea-4b3e-a2d0-6fd27c1745b1	11111111-1111-1111-1111-111111111111	5a3b8ca60eb3552edacc71c2e4941676d731fc2da95efe1c2662026ebebf74c0	2026-11-07 08:17:26.988624+00	2026-10-08 08:24:05.460626+00	2026-10-08 08:17:26.683159+00	\N	\N
1f2629f2-b00a-4b21-a025-5d8d6d5fbaed	11111111-1111-1111-1111-111111111111	e53d0b13a9837c457638e35d580ae26f84f677d09de85c90232d3610d13aa409	2026-11-07 08:24:05.939752+00	2026-10-08 08:25:40.782273+00	2026-10-08 08:24:05.65156+00	\N	\N
ddedd0d9-a59c-4017-926c-5e95a9312827	11111111-1111-1111-1111-111111111111	b114243b68265a0998255befa5392526111ee601a7655cf88d8dff27ae8cd3d1	2026-11-07 07:54:51.164503+00	2026-10-08 08:36:13.158868+00	2026-10-08 07:54:51.194655+00	\N	\N
8233b25a-9d8e-4953-a904-7ef7528030b5	11111111-1111-1111-1111-111111111111	8ac85f9cc2f7a318eedd193c7f661143d06ccc0817fc4a2dbde8aec515516c64	2026-11-07 08:36:13.16291+00	2026-10-08 08:36:13.158868+00	2026-10-08 08:36:12.914544+00	\N	\N
ef654dce-e11b-4bf4-806b-725bc4a12c03	11111111-1111-1111-1111-111111111111	2e514a319a9c50812d8301462232a91ceebdacef4124c0bf4fb5e13585cde3c2	2026-11-07 08:36:14.876971+00	2026-10-08 08:50:00.656691+00	2026-10-08 08:36:14.630034+00	\N	\N
66c402e7-9905-44de-8736-79b6f6728b86	11111111-1111-1111-1111-111111111111	7d6d94c04d2df90c130c03775ce81dff5da87defdd2040b7b315ec52e0ff0bf9	2026-11-07 08:50:01.088239+00	2026-10-08 09:00:36.017168+00	2026-10-08 08:50:00.893715+00	\N	\N
3a30a6b6-c8ea-49fc-a0e6-02c013660a62	44444444-4444-4444-4444-444444444440	dcce9ca7a89a17f9be000b81488a1dce322cf2a1af2c7ae42bf2ed6a6e3a3534	2026-11-07 09:00:39.331915+00	2026-10-08 09:03:05.05789+00	2026-10-08 09:00:39.158624+00	\N	\N
55a922dd-bc5b-4024-be65-fa8add6364f1	44444444-4444-4444-4444-444444444445	5c032118fefb099a9b77f9b0facb7a70edaf95a4eadfd32ee9564897f64ccb17	2026-11-07 09:03:06.837754+00	2026-10-08 09:07:13.690369+00	2026-10-08 09:03:06.671472+00	\N	\N
c3d3a985-6230-4a4a-92c8-352deed5fc86	11111111-1111-1111-1111-111111111111	80e041fca1fe1bf6db1df86ad2a4aa3889a5f7f5a0867b75beab85fd21626ab8	2026-11-07 09:07:16.032573+00	2026-10-08 09:08:31.26122+00	2026-10-08 09:07:15.87731+00	\N	\N
82b738bb-47e8-4241-87a0-be4e0b14a02c	44444444-4444-4444-4444-444444444440	f650cdefb3ed44b9a996ae1a331f81ad85c139f4d535cee2e83eb9fe8a9b257f	2026-11-07 09:08:33.902985+00	2026-10-08 09:28:36.033346+00	2026-10-08 09:08:33.751765+00	\N	\N
23d9c792-0e81-46b6-bbba-978f0137179b	44444444-4444-4444-4444-444444444440	7658ab8054d371a90c40c4186b1a288fa02c26912f16723af8d2c032deb8d4fb	2026-11-07 09:28:36.324337+00	2026-10-08 09:34:47.305589+00	2026-10-08 09:28:36.23002+00	\N	\N
925e7d50-aba1-46a5-84f0-f4fc6d83c3a0	44444444-4444-4444-4444-444444444440	17a5f09b0ed39bc8012094b390ab698f4666ef65f54c56b664438b573b4b5492	2026-11-07 09:34:47.572713+00	2026-10-08 09:35:14.414505+00	2026-10-08 09:34:47.49569+00	\N	\N
2e0d6032-8ed2-4522-9d43-16c861ba834b	44444444-4444-4444-4444-444444444440	a088b41f1a0abd2ef65171ab185433009fbf9561331f78aec7c51ff151aa46ce	2026-11-07 09:44:10.341589+00	2026-10-08 09:47:03.219047+00	2026-10-08 09:44:10.373783+00	\N	\N
92beeb07-734e-405a-9648-8ac80abf4695	11111111-1111-1111-1111-111111111111	0ee60fb93ae0c4f0fddffb8c82b76fb583bc72edb301c3a189ec416f171de7a7	2026-11-07 08:50:01.047274+00	2026-10-09 02:01:32.198606+00	2026-10-08 08:50:00.843566+00	\N	\N
215c4f65-d3fc-4ffe-af24-32c20ce422df	44444444-4444-4444-4444-444444444445	2e9c28386e1ce992d782365f25bd9c7ef948d74fe3fba442607486c75688641f	2026-11-07 09:35:16.495707+00	2026-10-08 09:47:57.515789+00	2026-10-08 09:35:16.420469+00	\N	\N
71dfcf18-7a64-4c8e-87de-1af47a7a6901	33333333-3333-3333-3333-333333333333	321bbf265fc43234eb16abbd291ad9bd3101044e51b2efcb72bf81b79ef7aee5	2026-11-08 08:05:48.995218+00	\N	2026-10-09 08:05:49.265611+00	\N	\N
de99484b-5aef-44af-85fa-bfe57617b1cf	44444444-4444-4444-4444-444444444445	248c33dbdd6d3c2b0a7f36b789b87f98713cee81dd22235b7c05018063e578c7	2026-11-06 09:32:37.465463+00	2026-10-08 09:47:58.085095+00	2026-10-07 09:32:36.179489+00	\N	\N
66843189-3e09-4647-967b-1b0179d47618	44444444-4444-4444-4444-444444444445	d23b39ff31e86b823600f26e5c9c6efb060cd6d8a5d9f3f7715d9bf7b54cac7d	2026-11-07 09:47:57.776367+00	2026-10-08 09:47:58.085095+00	2026-10-08 09:47:57.735879+00	\N	\N
8e721555-43d9-4ed7-bacf-95d1580cb28d	44444444-4444-4444-4444-444444444440	7e4b51fd4a8f5aea421087dae20e12c077b265825f97e357b4e737da642e688a	2026-11-18 07:19:26.136393+00	2026-10-19 07:24:20.476435+00	2026-10-19 07:19:25.470653+00	\N	\N
e9658cd6-7c24-4c89-94a7-0ba999ee29d0	44444444-4444-4444-4444-444444444440	30f3f90a38ac1f05975c624cdf928cbcf4d7d0ae8dff351ec5e698d57fdc6a57	2026-11-07 09:52:51.637043+00	2026-10-08 09:53:03.193903+00	2026-10-08 09:52:51.609029+00	\N	\N
694c484e-f2c1-4bd0-8d46-638abf62b109	44444444-4444-4444-4444-444444444440	e50641ba3a8d91eda19cc798828ccc04efb3501d0d2c5933b33d3616cf9e5e7a	2026-11-07 09:53:03.459793+00	2026-10-08 09:53:05.799729+00	2026-10-08 09:53:03.444027+00	\N	\N
708ab552-75c6-40bf-898f-219e2b7b7b6d	44444444-4444-4444-4444-444444444440	dd9db28bb4dd5ddac75cb1a9fb370e796f5a0b27958c97025fbb36672d79e811	2026-11-18 07:24:21.349125+00	2026-10-20 05:25:25.567283+00	2026-10-19 07:24:20.687737+00	\N	\N
6958835a-e019-4511-a677-c1eaeac1099a	44444444-4444-4444-4444-444444444440	dd1a866ca890f4c32bcaff99d5e499926a26e5b7e702d66b5a0126c7999c9ba7	2026-11-07 09:47:03.314503+00	2026-10-09 01:49:44.044914+00	2026-10-08 09:47:03.346456+00	\N	\N
d9ba10e5-c43f-41bd-8dd6-a17b935d4f6f	22222222-2222-2222-2222-222222222222	9668f8f016989bc84f8f9103f09ea0f24c58affb27e9971fcfee7b909ed933da	2026-11-08 08:34:02.361671+00	\N	2026-10-09 08:34:02.714143+00	\N	\N
6ccedbe4-6df7-47c0-8245-79942376fdee	44444444-4444-4444-4444-444444444440	626360e28675def54f5f0739ffc08bcc60e0b7eefbb62874e79207d4308424fd	2026-11-08 01:49:44.158995+00	2026-10-09 01:58:58.669382+00	2026-10-09 01:49:44.189659+00	\N	\N
4aeb963c-bc4d-4875-a7f5-179058f50ac7	11111111-1111-1111-1111-111111111111	db05034d351cf29774929c29a5c52cbd87319dd52f3ffb2c7bb1dedd7867ab91	2026-11-07 09:07:15.436718+00	2026-10-09 02:01:32.198606+00	2026-10-08 09:07:15.283013+00	\N	\N
76cd2945-bc68-4d4c-973d-7ca074192f9c	11111111-1111-1111-1111-111111111111	434141882fbbda3bd1b8bc5d27ab5bfc85766e221f92cca28f8174da405feeb5	2026-11-07 09:53:11.1232+00	2026-10-09 02:01:32.198606+00	2026-10-08 09:53:11.108573+00	\N	\N
95155071-d122-4907-bfa6-380a8958e581	11111111-1111-1111-1111-111111111111	fdc1ffa38ed21d8a225a0175e6b289be0c403d0b1f8b8b216324d5c14ef09ef7	2026-11-08 02:02:14.839351+00	2026-10-09 02:11:10.05745+00	2026-10-09 02:02:14.862755+00	\N	\N
f4fe6e97-aaa2-49ba-af03-55ce0a2b72a5	11111111-1111-1111-1111-111111111111	784e8299aaef5cbadd6c6cadde5dbcb31e0d8009559d11858d7ea597a858472b	2026-11-08 06:56:31.704516+00	2026-10-09 08:50:01.008416+00	2026-10-09 06:56:31.778227+00	\N	\N
72eb5084-4cf0-4756-bb60-c623c1683062	11111111-1111-1111-1111-111111111111	164458e133ad3869f13d4ed334b4a499ea71e708deb3bbd6ea2519ba308e3caf	2026-11-08 02:11:12.837927+00	2026-10-09 02:22:57.468068+00	2026-10-09 02:11:12.354448+00	\N	\N
0caf3040-9fd8-4383-a215-bb2e9c109e81	11111111-1111-1111-1111-111111111111	67c822a80f79dd63a1f7999950f00159a425cf9fd90cfd46b260be25f2c7c0cc	2026-11-08 07:49:18.882032+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:49:19.1032+00	\N	\N
b2ce6eba-6af7-46af-a2ce-f5c02ae379ee	44444444-4444-4444-4444-444444444444	79afd9e6d93fe0da46fc1d397b76363c4359c425b6717d4a5e2b0ef3d4e84468	2026-11-08 02:23:02.708506+00	2026-10-09 04:12:12.729417+00	2026-10-09 02:23:02.738039+00	\N	\N
06505250-f799-428b-bd98-266bb1254b86	11111111-1111-1111-1111-111111111111	a06d671c18e91196f360e869182286ff42744f62aebcdc51169c45e9f098ba25	2026-11-08 08:03:45.044846+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:03:45.308684+00	\N	\N
43a135dc-4d04-4303-83ba-4ebbc7493ef0	11111111-1111-1111-1111-111111111111	54465603c4db4574ce04dab7d332107e4d61c8ca927e030eaa8190e4d81954c5	2026-11-08 04:30:16.807483+00	2026-10-09 04:44:17.975849+00	2026-10-09 04:30:16.405152+00	\N	\N
a1cfa303-3c87-4f69-bf51-4b77d741aef2	11111111-1111-1111-1111-111111111111	9ce59696a13cf0c09efec8a0c3301d574bc58c3c874477abd4eff9271b37d7e2	2026-11-08 08:03:53.546641+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:03:53.818931+00	\N	\N
0e0a4d79-0bd0-4d8e-ae7a-cebbffd20791	11111111-1111-1111-1111-111111111111	34e5c53913125a3d560cad199e32477b7ea5def70e9f5541cd8a908ea69e1fbf	2026-11-08 08:05:43.623239+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:05:43.892489+00	\N	\N
6ef46d8a-e1a0-4a6a-81dc-1f813d82bdce	11111111-1111-1111-1111-111111111111	31faabd08827837efd033c88491fb5491300318a8cae36535cfa47db7903aa99	2026-11-08 04:44:18.604255+00	2026-10-09 05:23:54.465719+00	2026-10-09 04:44:18.246424+00	\N	\N
640a3b49-2860-47c4-8c80-60b6b576223d	11111111-1111-1111-1111-111111111111	531b99824bbd430c77891c00caba6fd07c0fd0cb6f59bde969789eb5a1429add	2026-11-08 08:21:15.096834+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:21:15.411016+00	\N	\N
78612cf0-cca0-40b1-9f1d-a2fdb665d51a	11111111-1111-1111-1111-111111111111	c3bce6d572c28cd0c29ce4a410deb2a1f9b424c8f24586528628b69137224931	2026-11-08 08:22:28.652984+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:22:28.972597+00	\N	\N
1a702454-7524-40d3-8d52-729747975a6a	11111111-1111-1111-1111-111111111111	4c875f602ec68ad91d30193e01dc09e8f5c331a82ae5a6e2d8390a33561d3560	2026-11-08 05:23:54.961229+00	2026-10-09 05:23:56.17772+00	2026-10-09 05:23:54.697501+00	\N	\N
585e76db-6717-4870-a0f2-7206e6aebc4b	11111111-1111-1111-1111-111111111111	04bd2ee8619ca6a2e403d3de271c0241ac105e6a0dcfbf9c98285c44c6772a8b	2026-11-08 08:49:27.230604+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:49:27.625265+00	\N	\N
d34e0ddd-e33b-488e-aa6e-e404f474966a	11111111-1111-1111-1111-111111111111	610334c3b94154f298e3fe95631c85a82e21ac0388b0d535a0cd0e64a99bfe76	2026-11-08 08:50:00.475319+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:50:00.8721+00	\N	\N
1b3c30be-4c0a-4ddf-b3e9-e4c56e7ad132	11111111-1111-1111-1111-111111111111	b32eb41b6cf14144049425204e1a350c3ceb9692e17101b0709c3a7d8cb9d329	2026-11-08 05:23:56.73548+00	2026-10-09 05:24:05.896988+00	2026-10-09 05:23:56.479914+00	\N	\N
34255d01-d86f-4e24-8264-3c21907addc6	22222222-2222-2222-2222-222222222222	73b1d42b903a9c8f843f222739e23de5bbb578de02ae0a156d38bdeef0a5a56c	2026-11-08 05:24:08.981631+00	2026-10-09 05:24:12.369138+00	2026-10-09 05:24:08.7183+00	\N	\N
1fe552e6-c838-405e-b5e4-9758e888bda2	22222222-2222-2222-2222-222222222222	0753ac0a180220a5221fb6c22a1374d9c529378d09c278c26b15d997ebdc3b0e	2026-11-08 08:53:17.378288+00	\N	2026-10-09 08:53:17.770962+00	\N	\N
0d415688-0f56-4658-8e1f-b8efce3477f9	11111111-1111-1111-1111-111111111111	da6518ca3655e2bc6cac7144441c7975e1c65ed493c6c13f85d8dbfc7431d959	2026-11-08 05:24:14.498404+00	2026-10-09 05:42:29.22577+00	2026-10-09 05:24:14.235318+00	\N	\N
5b49f0de-57c1-4928-8df6-0af0137b1a14	33333333-3333-3333-3333-333333333333	f5d81f62611f2bc8ec9838c0b06af8e93537617e3d9893a9b6fb8c116d46720b	2026-11-08 08:53:20.350265+00	\N	2026-10-09 08:53:20.751056+00	\N	\N
34df6257-4186-4b7b-b9d9-5f9614d2f7bc	11111111-1111-1111-1111-111111111111	7ff7c024b5b53f89a4af04ae929bc25c2f9907735bdca0131fafc29d256ec412	2026-11-08 05:42:29.702261+00	2026-10-09 05:45:15.202502+00	2026-10-09 05:42:29.501507+00	\N	\N
aeb8a789-2c3d-4453-93f3-88adf06ce83a	11111111-1111-1111-1111-111111111111	07c89be652f7179d2ffa93f87b3f9302bd0ad26dc3fd80d3cbe85ad073455f1d	2026-11-08 08:55:07.792028+00	2026-10-09 08:55:49.480148+00	2026-10-09 08:55:08.189206+00	\N	\N
18967d5f-9e11-4c8e-a470-07147a118294	11111111-1111-1111-1111-111111111111	66f65a5a0ac064b92846bf7fe317c312d90309aa2928a85afdab7be8018d882b	2026-11-08 05:45:15.62371+00	2026-10-09 06:18:05.024931+00	2026-10-09 05:45:15.418738+00	\N	\N
c06ebefd-6194-44b2-ab9d-075bb0145a7e	44444444-4444-4444-4444-444444444440	8e3fb5b91e01da8dc88501ec8092e4a42f1b7fa1f72bdcc1465dc8ee7593f29e	2026-11-07 09:53:03.406646+00	2026-10-16 07:33:15.652628+00	2026-10-08 09:53:03.379464+00	\N	\N
8f2e5fb1-e70e-4e6d-887d-d824cd259be0	11111111-1111-1111-1111-111111111111	5468fdc949e36b58f038058e29f3871f713b3fb478805816917c0a342985c917	2026-11-08 04:44:18.558126+00	2026-10-09 06:18:05.496824+00	2026-10-09 04:44:18.193379+00	\N	\N
b18674a5-c0d1-4fdb-8917-170f17fc1a4d	11111111-1111-1111-1111-111111111111	9d956d525d7349495a84845575caaea8c33dccb52fed6b27a27030dd7ac0a037	2026-11-08 05:23:54.966596+00	2026-10-09 06:18:05.496824+00	2026-10-09 05:23:54.702914+00	\N	\N
e87edbc0-7b6d-4329-9bcd-3a11f1f58b92	11111111-1111-1111-1111-111111111111	623cd4570fc054a9ae28757c47ea7a6b413e126b0e9223fa1ce4712968c8ea49	2026-11-08 05:23:56.649756+00	2026-10-09 06:18:05.496824+00	2026-10-09 05:23:56.386277+00	\N	\N
b91551c0-91ba-475a-9550-bbd423798365	11111111-1111-1111-1111-111111111111	717e342000b0bf483e50115c1213cfa9719b9dea72800a8b6dc9f17df410d680	2026-11-08 05:42:29.646247+00	2026-10-09 06:18:05.496824+00	2026-10-09 05:42:29.434284+00	\N	\N
e2893222-0f2a-4761-9188-373dffc8f422	11111111-1111-1111-1111-111111111111	17d0d6bd65eb8992b91f4b66d9d5e739fcdb42ffad31df0dc42f05a44bec4a0f	2026-11-08 05:45:15.618075+00	2026-10-09 06:18:05.496824+00	2026-10-09 05:45:15.413684+00	\N	\N
7aecc1c7-7e7c-44bb-b882-67911730160a	11111111-1111-1111-1111-111111111111	4768636aef9b0dadb91a9adc03d615ce75b903e28e99a735f3268e8407e47bb2	2026-11-08 06:18:06.535428+00	2026-10-09 06:18:05.496824+00	2026-10-09 06:18:05.235353+00	\N	\N
3b417052-9205-413c-99ad-d4fb018cc768	44444444-4444-4444-4444-444444444440	7cd5005782a6de51b6235d5a9ca3d200c549cc9551c570103374f2b0ec5e3a3d	2026-11-08 01:58:58.779011+00	2026-10-09 06:39:35.652318+00	2026-10-09 01:58:58.804673+00	\N	\N
b46498f5-d339-4e42-9ae6-6a425ab18eb2	44444444-4444-4444-4444-444444444440	00fd198577dc100df06cb0fb0d0c17d4dade3911d6b9deeec78c67ca2ba93ae1	2026-11-08 08:32:38.365696+00	2026-10-16 07:33:15.652628+00	2026-10-09 08:32:38.705416+00	\N	\N
6a23d21f-7f28-420a-a000-5b46e829ff03	44444444-4444-4444-4444-444444444444	9334c50298d93790c3c52bf9dce7c9aeb93249d0ffb30bd48ed89218bfea1e12	2026-11-08 02:23:01.538636+00	2026-10-16 07:52:16.30955+00	2026-10-09 02:23:01.568318+00	\N	\N
deb988b0-a6b6-4483-97d9-161520fade95	11111111-1111-1111-1111-111111111111	90d9a6e27263624550a78835ffcce2b6dfd8a8614f313bb53341850eedce00a9	2026-11-08 06:39:41.912024+00	2026-10-09 06:39:40.9617+00	2026-10-09 06:39:40.676353+00	\N	\N
5d7f5d16-9935-44e6-a0fe-1396968c5a3f	44444444-4444-4444-4444-444444444444	f93091f16472d0a52779ea2efecef671f21ea87ec151e4510c95de9924fe86ef	2026-11-08 04:12:12.836198+00	2026-10-16 07:52:16.30955+00	2026-10-09 04:12:12.869783+00	\N	\N
1d0cef2c-f709-40a4-bdf5-3388036c90b4	11111111-1111-1111-1111-111111111111	16475379c856674dcab82ea2d2e88cfa6ce3cd49eeef0ecdd7a7f9c3a0d8e5b7	2026-11-08 06:39:43.682308+00	2026-10-09 06:56:31.563707+00	2026-10-09 06:39:42.446515+00	\N	\N
5aa952b3-53f3-4e0f-94b9-2dcd4273e8af	11111111-1111-1111-1111-111111111111	ecd7583a7afee69dd9dc99e030dfc741a377795a7b29b9865d6de91e64c0ea24	2026-11-08 06:56:31.801654+00	2026-10-09 07:10:36.494854+00	2026-10-09 06:56:31.883502+00	\N	\N
07f89107-8120-47a2-abef-a06351fba356	44444444-4444-4444-4444-444444444440	e83eacf93557adf642ca5a908d2dcba393b508afffd1ddd304915f56fb627efe	2026-11-08 06:39:35.746553+00	2026-10-09 07:13:56.403452+00	2026-10-09 06:39:35.782516+00	\N	\N
50fb65a6-824f-42a4-a9c6-9e35663e4a37	11111111-1111-1111-1111-111111111111	eeb7c275447d2287f6e0d48ceadd26f78d7a6dc0c21ed2c81c6ec109a629d3a3	2026-11-08 07:44:38.034907+00	2026-10-09 07:45:02.433181+00	2026-10-09 07:44:38.065185+00	\N	\N
e6738061-d8c0-4a58-adb2-24bb72a0d5dc	11111111-1111-1111-1111-111111111111	468c5515c39a80caaefa157f2cfbff0fde457fb0acce069a5b171859ccaba268	2026-11-08 06:18:08.94245+00	2026-10-09 06:39:40.465382+00	2026-10-09 06:18:07.641514+00	\N	\N
167a3ef0-8a11-4ceb-b377-529dbbdbe456	44444444-4444-4444-4444-444444444440	60ec75e15fca03e4df825b3eb16fe40fa3d97e9262b3368518d1d3704f86981d	2026-11-18 07:24:21.364132+00	2026-10-19 07:26:53.478861+00	2026-10-19 07:24:20.71243+00	\N	\N
4f75aa6c-1676-493d-853d-34399f8075d9	11111111-1111-1111-1111-111111111111	460b6b2ead9deda794dc3fc18cb7a6c5e3bdff728f6c276a49a0b0a4dd8d406d	2026-11-08 07:31:02.437241+00	2026-10-09 07:49:18.890831+00	2026-10-09 07:31:02.605542+00	\N	\N
b6470a54-02a6-49d4-9cc2-4ab814aa0a5f	22222222-2222-2222-2222-222222222222	69e8fe7ad63a775b97d0e6fc36a4eb4a90321ff59056141674179a9c55b5a57f	2026-11-08 07:12:54.400092+00	\N	2026-10-09 07:12:54.519671+00	\N	\N
9304d65e-b48b-468a-b0a6-8a373d3e57d3	33333333-3333-3333-3333-333333333333	5976f3b9a93c1eefc01aadae02f5ade87d3b3bea89c030793fa3af118098fa22	2026-11-08 07:13:25.813661+00	\N	2026-10-09 07:13:25.942865+00	\N	\N
368e4707-ff7d-41d6-9067-4d637acb661b	22222222-2222-2222-2222-222222222222	8a4c1bb882e516217f5a6abcbbbb90ba307973d4af16dfff5fb1c4cc1227cfcb	2026-11-08 08:05:45.538326+00	\N	2026-10-09 08:05:45.80855+00	\N	\N
09c02eee-5401-4582-a553-7491fdd45e50	44444444-4444-4444-4444-444444444445	41a4397a2862d368303026e6e127904e967ba209477c7f43ac73884730643d56	2026-11-18 07:26:57.792126+00	2026-10-19 07:33:57.983621+00	2026-10-19 07:26:57.147683+00	\N	\N
fb7fe530-dc8f-4a4b-96c9-c060d9d7aa6c	22222222-2222-2222-2222-222222222222	353c10ca3dee7d06a6e724a72a0c7cb0f80ad82129909884bc86a141faf0a054	2026-11-08 07:22:41.795245+00	\N	2026-10-09 07:22:41.94004+00	\N	\N
923e556d-23e7-4698-a1d9-e78379859188	33333333-3333-3333-3333-333333333333	494b848221c61ea4a0c57f77bb1fcf9f6bda9982e184352a47302e9f8578e873	2026-11-08 07:23:13.507312+00	\N	2026-10-09 07:23:13.665462+00	\N	\N
421c2205-264a-49f7-befb-999d0884c7d2	44444444-4444-4444-4444-444444444445	a6d27c81ec3a586c5c1b1b0e988a4835d97dc8d44a3bba6c09cd46e954e3f72d	2026-11-18 07:46:44.473546+00	2026-10-19 07:47:13.973176+00	2026-10-19 07:46:43.874954+00	\N	\N
3bcbef8d-b930-46a6-91dc-e4024cc816c0	11111111-1111-1111-1111-111111111111	fb51a42526bb52328d189616ec982588453af74a29fdc51c65d719d1bffaf8e3	2026-11-08 07:10:36.674276+00	2026-10-09 07:30:06.770986+00	2026-10-09 07:10:36.795947+00	\N	\N
1dfbc41c-d3ff-458b-af20-e093b1b41938	44444444-4444-4444-4444-444444444445	83e568d0674fb9391821e8118a47828977dfec050079384152eefbc78e2f02d8	2026-11-18 07:47:14.767836+00	\N	2026-10-19 07:47:14.169499+00	\N	\N
6e64ca19-822a-46d6-97cf-9260cf5d0ca2	11111111-1111-1111-1111-111111111111	88ee2f2192ab2d66367a6daaf0ccbc8d421c975a820604c3e84e26abd417d665	2026-11-08 07:30:06.835311+00	2026-10-09 07:31:02.392081+00	2026-10-09 07:30:07.001902+00	\N	\N
ff0bd5bb-8f16-46d6-b786-3aed92ce29b5	22222222-2222-2222-2222-222222222222	366147ad20cc7afaa5f38900d10817e6bd5e4ada04aef3eca83fb5eab0559138	2026-11-08 07:31:56.667974+00	\N	2026-10-09 07:31:56.850152+00	\N	\N
d8d75b79-e219-42ec-8375-6615c01dc1bd	33333333-3333-3333-3333-333333333333	fba24ed75789df5db79ab509367a81b19f638181a07e25275f1e9275c6cb1c52	2026-11-08 07:32:27.237185+00	\N	2026-10-09 07:32:27.420855+00	\N	\N
f5beb25f-8e77-4327-b535-11c57396d0eb	22222222-2222-2222-2222-222222222222	5aa8b2c90b1933982f22a95f66b4115cd9c8cca8c551370b4ff5e469512c5187	2026-11-08 07:36:28.537022+00	\N	2026-10-09 07:36:28.720609+00	\N	\N
7ada4fd4-8ecf-4393-a32d-60190bf011c4	33333333-3333-3333-3333-333333333333	3c0fb9a6d717e6077d8f11d2db070b109c34871db9ef072304c61b00c0785fbb	2026-11-08 07:36:31.946408+00	\N	2026-10-09 07:36:32.137223+00	\N	\N
69fda7d6-a3dc-4eb4-b444-eae2a7c5ce3e	44444444-4444-4444-4444-444444444440	98571b32b8c87bd1dd81614fa6ef538b89c7901a1522a8ba3fd9a317728909d7	2026-11-08 07:13:56.500901+00	2026-10-09 07:44:31.585195+00	2026-10-09 07:13:56.5332+00	\N	\N
7a7687f6-865a-4c2f-afcb-a9c722ae69ac	44444444-4444-4444-4444-444444444440	4b085a9421bbbb1ccb38c4eab4457f4ba8e48bf4b75d65940127d5748b365252	2026-11-08 07:44:31.690638+00	2026-10-09 07:44:33.832616+00	2026-10-09 07:44:31.720695+00	\N	\N
a54c8c1f-6e75-4fe7-a5b7-21e28ba59267	44444444-4444-4444-4444-444444444440	50f9bd0a0e50440de503f1b62708cb32fc7f5745e2fa7782b47df080e9b0fec5	2026-11-08 08:28:22.249124+00	2026-10-09 08:32:38.494941+00	2026-10-09 08:28:22.580841+00	\N	\N
dd110481-ec1c-45b9-9872-7adbd1d4d3ce	33333333-3333-3333-3333-333333333333	b15c56a491e7d5dd12a2b679004f548ee0ad518cae00785479eec5a2f3b9d19b	2026-11-08 08:34:05.846546+00	\N	2026-10-09 08:34:06.199358+00	\N	\N
a708b90b-f732-49ae-a178-5b2c821f0622	44444444-4444-4444-4444-444444444440	de0aa9dd322d8abbf8de6267bd9a26dea1796de941e0dd0b2596a3c72099fed8	2026-11-08 08:32:38.366197+00	2026-10-09 08:35:25.030691+00	2026-10-09 08:32:38.707779+00	\N	\N
6196cc7c-442b-4412-9736-aa28cd3605ef	11111111-1111-1111-1111-111111111111	93fafe7f5c85d5c7b7a6ce8d0f56e26b92016dca069c85773ffd02ec22490740	2026-11-08 08:35:50.574885+00	2026-10-09 08:50:00.636868+00	2026-10-09 08:35:50.924308+00	\N	\N
06723109-d59a-433b-afe6-94219b658a09	11111111-1111-1111-1111-111111111111	956b3c1c1958bbaa30b329f75710a745ab3ccea2fd6f59502300c10aec812f68	2026-11-08 07:10:36.598302+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:10:36.712156+00	\N	\N
0c0fe071-475d-40b9-b550-54af13d38f02	11111111-1111-1111-1111-111111111111	c32e2cb258b2b22f0a9a49cb766bdb0e16eefe156a1c0ddd381760fce69bc69a	2026-11-08 07:12:52.997236+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:12:53.11553+00	\N	\N
9b9967b9-6a0f-4521-a3d3-082f0ce14c54	11111111-1111-1111-1111-111111111111	6f63b0370ddf3293bc8abfffd3283e5d235745101b81ee3a4ba6bc49267838cd	2026-11-08 07:13:57.107853+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:13:57.230466+00	\N	\N
45c5fef0-95be-4e37-8170-2b6368213cfd	11111111-1111-1111-1111-111111111111	3dc1f1dce56937932e0fa708319e629b36a5ba75f6d0756d24043732689ed89c	2026-11-08 07:22:40.146598+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:22:40.303515+00	\N	\N
30099442-3286-48f0-9746-43e1a709142d	11111111-1111-1111-1111-111111111111	d5eb19f277070333039449814854222c21ec0261dbe61cfebb3ac479f69c772d	2026-11-08 07:23:44.783412+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:23:44.93123+00	\N	\N
e526e4c3-d502-4640-9d25-9bc3f668d26a	11111111-1111-1111-1111-111111111111	d19a41d8864834ce60d3c583852080f076abf657941097bb9394b50893e997bf	2026-11-08 07:30:06.813316+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:30:06.981219+00	\N	\N
5872e084-00fc-4fc0-bd8c-9320bd109bac	11111111-1111-1111-1111-111111111111	1b8a95809330b420795663a95538567b6e79740e187c400f1a5dd01b36a2b2fe	2026-11-08 07:31:02.43872+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:31:02.606899+00	\N	\N
8538efb4-0c8b-483b-abc0-d93f561c6202	11111111-1111-1111-1111-111111111111	750fccdc9b5be0860ba91e3ac9f59522a97fc4114307cb588d0a6b47425e17e3	2026-11-08 07:31:54.584575+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:31:54.765766+00	\N	\N
15838458-762a-4e2a-bb18-65d4f4fea043	11111111-1111-1111-1111-111111111111	f0b2b24e51b5c9862f8915aa70b8d4406097fb249eba6a100e3f3731a22a5749	2026-11-08 07:32:58.297388+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:32:58.473412+00	\N	\N
ac02828a-ae98-41ea-9c72-cb155b34cf90	11111111-1111-1111-1111-111111111111	a092d85cd9147b2d0539504338614ae6f68ac50009d4c2396c8e761affcce30b	2026-11-08 07:36:26.691275+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:36:26.874377+00	\N	\N
214f335f-3a68-4422-b4f0-505a39132a26	11111111-1111-1111-1111-111111111111	122e5cad54aa3821903d4352ae6461d11675076cf6b57646cf9842a467f0059b	2026-11-08 07:36:35.464802+00	2026-10-09 08:50:01.008416+00	2026-10-09 07:36:35.651385+00	\N	\N
c06f19c6-ecc6-4337-b2f9-133798e8fc8d	11111111-1111-1111-1111-111111111111	e274d6cec323039b59a3bdb77dc33cc2609bf16a2c666ff58ed0509bebd2530f	2026-11-08 08:05:52.50547+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:05:52.775303+00	\N	\N
4cee77c5-4d73-4cb0-9885-d00c445b925a	11111111-1111-1111-1111-111111111111	e59d5fb94075884fd96ada45102aa33e014f6d676a58f78d64ebe1b494fdf636	2026-11-08 08:34:00.383076+00	2026-10-09 08:50:01.008416+00	2026-10-09 08:34:00.735058+00	\N	\N
5054e15c-04f3-4090-a242-825be35af2f3	22222222-2222-2222-2222-222222222222	b56e75e61798c8a7cdaecfdf5079ca3e2c4a7b61bcaf202fef1e4928895189cf	2026-11-08 09:08:37.47165+00	\N	2026-10-09 09:08:37.915166+00	\N	\N
a728dfe2-489e-4249-bb82-46eb39840994	33333333-3333-3333-3333-333333333333	55d5992e1286814e86642ed5d7c0eadd8e754b3c8185674a609bfd9309266d1c	2026-11-08 09:08:40.958847+00	\N	2026-10-09 09:08:41.402959+00	\N	\N
35b97d5c-ccd7-4e06-82d9-5e727c3f760c	22222222-2222-2222-2222-222222222222	5023312cf2a008a866ab6bd9bc66c703c1b337686a55225587c0886d91cc6db7	2026-11-08 09:13:15.314512+00	\N	2026-10-09 09:13:15.768176+00	\N	\N
5791957e-624d-4988-8785-3478bd0aac38	7a2ef762-dfb2-4285-9757-ce0d1d2d629a	48828de32804930f471776e2c367d403659954de508fd51135af12da44c694cb	2026-11-08 10:02:51.163952+00	2026-10-09 10:03:11.181419+00	2026-10-09 10:02:51.822036+00	\N	\N
f1861344-f053-473e-ad92-b544625ff0a1	7a2ef762-dfb2-4285-9757-ce0d1d2d629a	4e8723bc081ccaae4418ca97502bc1a6376182abf7480ba37b6bffef32673b53	2026-11-09 02:18:18.347697+00	2026-10-10 02:18:22.103876+00	2026-10-10 02:18:17.998641+00	\N	\N
bbfe1c3a-ff97-4783-b619-a3129f07f122	7a2ef762-dfb2-4285-9757-ce0d1d2d629a	00ee87b3ef19cfc60a2b636c436380fc8f54148c100b65faf49d05fb66f641ff	2026-11-09 02:18:31.280619+00	2026-10-10 02:18:40.116048+00	2026-10-10 02:18:30.93157+00	\N	\N
9a323cef-f407-4e53-8f7a-0c6e66dc6b4f	7a2ef762-dfb2-4285-9757-ce0d1d2d629a	1517ef5bf61401ad1500eae6d2963b347ddd32e996f6be9159587786b5e9778e	2026-11-09 02:18:40.683748+00	\N	2026-10-10 02:18:40.324325+00	\N	\N
491e037e-2199-49d8-9742-7de5809786a1	7a2ef762-dfb2-4285-9757-ce0d1d2d629a	396ec22d2594343785d03564893df8f26ff77b51fdf476fc95fad826e739e001	2026-11-09 02:18:40.744816+00	2026-10-10 02:19:47.742741+00	2026-10-10 02:18:40.395523+00	\N	\N
ccdcd237-93f8-403b-bfed-73f669c1cb86	f1ac1788-2372-478b-897b-6ee076064fcb	1a5b3bfecbd0b2e52d0d34aca822157939b952c4cf0b670bd72bb37046ec783c	2026-11-09 02:19:57.106879+00	2026-10-10 02:25:16.105266+00	2026-10-10 02:19:56.758139+00	\N	\N
222ccf96-c974-43d7-b0d3-2c4d13d45f31	f1ac1788-2372-478b-897b-6ee076064fcb	72e7a700ba27c27373b5678388d8c30f91633c60d8165718cd58c1f1cd475246	2026-11-09 02:25:16.661355+00	2026-10-10 02:25:39.85447+00	2026-10-10 02:25:16.319344+00	\N	\N
cd4497f4-fe1e-44b5-b6aa-50f23a94b80c	f1ac1788-2372-478b-897b-6ee076064fcb	9880f3fc6efe0a05a2d37958b1b7170f40f6e2fb2286d53abd5d8c25331f1062	2026-11-09 02:25:40.408544+00	2026-10-10 02:26:55.366895+00	2026-10-10 02:25:40.068164+00	\N	\N
dc661fee-c39c-487f-997b-2cb42c11540b	f1ac1788-2372-478b-897b-6ee076064fcb	d6631c47295ab6fee2c899ee4f42076e6899cbf8f55a95a1a503f56f63a50d68	2026-11-09 02:26:55.920056+00	2026-10-10 02:31:42.86596+00	2026-10-10 02:26:55.58274+00	\N	\N
8b77345d-97fe-45a9-9777-80c3083192d3	f1ac1788-2372-478b-897b-6ee076064fcb	f8cd53735aa7c3eb1d85a60cf40e57feedc538b77b112288f4ac3ebd968caa8e	2026-11-09 02:25:16.659273+00	2026-10-10 02:41:38.793043+00	2026-10-10 02:25:16.317329+00	\N	\N
48c48856-0705-4309-ad9b-b34741ac09a8	11111111-1111-1111-1111-111111111111	f057455aafe280929c147f30b9210432477eb30e61e80f802dddf848f8389003	2026-11-08 09:08:35.497437+00	2026-10-16 05:41:07.292173+00	2026-10-09 09:08:35.941207+00	\N	\N
dc7eb760-bce1-4ea1-b2b4-dc5ee6d4a20d	11111111-1111-1111-1111-111111111111	14deb11a1b0bd3a36254818adfc78a4aec41e2d975f41d6af8674ca0fcadf059	2026-11-08 09:13:22.383135+00	2026-10-16 05:41:07.292173+00	2026-10-09 09:13:22.839745+00	\N	\N
a6483aaa-f669-4ca7-aec6-c50d59ba5a35	f1ac1788-2372-478b-897b-6ee076064fcb	b89f889bb883dad216df80b99a3d3e6ed61067019218e23738488adc507374ee	2026-11-09 02:31:43.409458+00	2026-10-10 02:41:38.308752+00	2026-10-10 02:31:43.085489+00	\N	\N
56941f6c-5593-4a1f-98eb-cb998a357a87	44444444-4444-4444-4444-444444444445	87f384365599048f21d7f32e576b3872c88633572aec67694ac131e5f19809b5	2026-11-18 07:33:58.844977+00	\N	2026-10-19 07:33:58.219769+00	\N	\N
c974cbe8-cb1a-461a-a320-3d6567525840	f1ac1788-2372-478b-897b-6ee076064fcb	16ff3d54b7f3a17c7369d0919c8a4cac52bed739c5471869a37677cd2a26323b	2026-11-09 02:25:40.401952+00	2026-10-10 02:41:38.793043+00	2026-10-10 02:25:40.061594+00	\N	\N
bbf9a719-0068-4f72-8c8c-d2dba73e423d	f1ac1788-2372-478b-897b-6ee076064fcb	78b0b94a802c25a23ae55995af2138de61824f605918ee1e657fffef80e3b32b	2026-11-09 02:26:55.913202+00	2026-10-10 02:41:38.793043+00	2026-10-10 02:26:55.575445+00	\N	\N
eafaea4b-d183-4bf1-aa79-4898ba2f573d	f1ac1788-2372-478b-897b-6ee076064fcb	fd0232d0e0191870f45fce1b94d9ebe6820f32c3dd5225babde0600b6424f15a	2026-11-09 02:31:43.410515+00	2026-10-10 02:41:38.793043+00	2026-10-10 02:31:43.085743+00	\N	\N
6c74aea0-c20a-462d-912e-d3eca76b57bd	f1ac1788-2372-478b-897b-6ee076064fcb	0fe348c8fa1ac99fdde47751a4fda627ab1d5c1a93ff06e272444a138f9cc262	2026-11-09 02:41:38.818938+00	2026-10-10 02:41:38.793043+00	2026-10-10 02:41:38.52629+00	\N	\N
9145ddcd-02ab-4c1e-8169-02ed2ace47c7	44444444-4444-4444-4444-444444444445	fb589934fda83906389d0641f54b7f864dbd2e4a6fe908f2516367f3b76a31c8	2026-11-18 07:34:28.076119+00	\N	2026-10-19 07:34:27.442602+00	\N	\N
1a536eb0-91d4-418e-ae30-5f84703c4561	f1ac1788-2372-478b-897b-6ee076064fcb	27c7ce4c3fc9d98e267da70c3ce8d978d7174d0c04728e41c414441b3aa7adcd	2026-11-09 02:41:45.811896+00	2026-10-10 02:41:56.860782+00	2026-10-10 02:41:45.520121+00	\N	\N
dc31409d-601e-494e-bc7c-ca8cf45adb1d	44444444-4444-4444-4444-444444444445	9c28f64d0361e6131dc897bbdc5a6abea4afd1e50ca8e8c1611510939af7e11b	2026-11-18 07:46:10.154497+00	\N	2026-10-19 07:46:09.553138+00	\N	\N
fc664124-152e-4a7f-bcc0-6341823b22af	11111111-1111-1111-1111-111111111111	9b8d2287f46688a28faaca4bfca2a0a1e6c5d9d1395713b9f707114bec7e9b4e	2026-11-09 02:42:02.66768+00	2026-10-10 02:43:46.623685+00	2026-10-10 02:42:02.376494+00	\N	\N
f9d2640c-d97e-4a7f-8823-3b379acd7734	11111111-1111-1111-1111-111111111111	43e117d3b318e16f2b81d5ccf9ad853969379791ed95a4b4cef6aa0de2b4a28e	2026-11-09 05:01:57.875537+00	2026-10-16 05:41:06.878618+00	2026-10-10 05:01:56.950428+00	\N	\N
ac3f0c3c-98b1-4700-a012-e54a539d9229	11111111-1111-1111-1111-111111111111	f16defb4eaf2618b4d5432a4d203ff39a06b91a5f86fb136b2112b4ea8a86123	2026-11-08 08:53:16.04782+00	2026-10-16 05:41:07.292173+00	2026-10-09 08:53:16.45293+00	\N	\N
a314f677-b741-45f2-a38d-f7d8c5781144	11111111-1111-1111-1111-111111111111	5779493812c754df67bfd657e77d17fa3666014367913a8baac8d648adfa9f4e	2026-11-08 08:53:23.452522+00	2026-10-16 05:41:07.292173+00	2026-10-09 08:53:23.859301+00	\N	\N
1f494eae-31b9-4cc9-8782-712c9de05c70	11111111-1111-1111-1111-111111111111	2ee0c5936162b870b4388f5cc9f0c00d0dc09367ca434dc8a00dc024366d25c8	2026-11-08 09:03:24.932485+00	2026-10-16 05:41:07.292173+00	2026-10-09 09:03:25.363862+00	\N	\N
61753cea-ca65-4a68-a5d3-94945458d4e8	11111111-1111-1111-1111-111111111111	889ea4f76bd3e6aeae9e6379155e08098c3030f838816c2e8a49d4373782c8b7	2026-11-08 09:08:44.578982+00	2026-10-16 05:41:07.292173+00	2026-10-09 09:08:45.012942+00	\N	\N
71c77e49-0cbc-40b0-85b7-5d46edfe56d9	11111111-1111-1111-1111-111111111111	66f7a031b9ecd62408d2a7e3306e39d7481b83dddc32543d52c3c089ea3b4358	2026-11-08 09:13:13.23254+00	2026-10-16 05:41:07.292173+00	2026-10-09 09:13:13.687277+00	\N	\N
0c7918ef-120d-4d87-be2f-cb501b290950	11111111-1111-1111-1111-111111111111	31781ce253e81e136344be1db12debdef23a0385307e3debe04ed4a0f9a64321	2026-11-15 05:41:07.754581+00	2026-10-16 05:41:07.292173+00	2026-10-16 05:41:07.094505+00	\N	\N
1796a839-fd61-4ee7-845f-66bb40dd29de	11111111-1111-1111-1111-111111111111	363686c0599bebd77d7b3a04f4cd61709978da6aae9442a0236054d79c912db3	2026-11-15 05:42:59.016923+00	2026-10-16 05:58:05.597937+00	2026-10-16 05:42:58.362102+00	\N	\N
c4aefc3b-d398-4c8f-bd95-afc5252122cc	11111111-1111-1111-1111-111111111111	382fa005ab019b028ff82c7c0ab74cd29bb6b511f7c2bed71074a4af98b0055c	2026-11-15 05:58:06.412762+00	2026-10-16 06:34:32.442922+00	2026-10-16 05:58:05.80109+00	\N	\N
6fb31096-0903-4440-909b-9c5fc8b7fb1c	11111111-1111-1111-1111-111111111111	35d24583af47ab8d56302af12e12d28201d10a892f53eb5e73b5c2891fa31aca	2026-11-15 06:34:33.166755+00	2026-10-16 06:49:54.950244+00	2026-10-16 06:34:32.641866+00	\N	\N
6f3e49b5-99f4-42ae-a4df-34a8834a94c9	11111111-1111-1111-1111-111111111111	c7e851191d3fc321d900fc037b8b2f876c82bce69f7112aeff23b0bba4af517a	2026-11-15 06:49:55.651605+00	2026-10-16 06:55:13.142031+00	2026-10-16 06:49:55.181289+00	\N	\N
f932cf00-b59d-4d7a-acc7-4d0ad18836f6	11111111-1111-1111-1111-111111111111	c25db305399f3e266caaf9aaa4ad6506bd92bcf3dcaaf74b877a1096f72b8be9	2026-11-15 06:55:13.861676+00	2026-10-16 07:04:13.375049+00	2026-10-16 06:55:13.406583+00	\N	\N
78ee56af-1d80-4aec-b7c1-ccdee61ec5cc	44444444-4444-4444-4444-444444444440	31f4db9c8b99bdf449c97b20b96db703eb395b59ff76812f2dac0ca6a31a90ac	2026-11-15 07:04:16.12108+00	2026-10-16 07:33:15.145082+00	2026-10-16 07:04:15.68007+00	\N	\N
a7dac98c-9389-46a6-a22c-5a3703b78a45	44444444-4444-4444-4444-444444444440	46975a9e6cf76768214675af0c0467490b767ca79c0572cfc97f8a442a38e4c0	2026-11-07 09:34:47.57122+00	2026-10-16 07:33:15.652628+00	2026-10-08 09:34:47.495318+00	\N	\N
cc70db33-15df-43b8-b965-61d869991d6a	44444444-4444-4444-4444-444444444440	263c191fed535ee1ef0c23563b19a661bb311b603d553dbc06589e0f48453330	2026-11-07 09:44:09.249959+00	2026-10-16 07:33:15.652628+00	2026-10-08 09:44:09.283248+00	\N	\N
500037ab-4a22-4e1b-aacb-0adb16ec53b0	44444444-4444-4444-4444-444444444440	0c02ed67f800a8209904cb0647bf41db65f4895b56075a7daa7189f83c2cd9bd	2026-11-15 07:33:15.775846+00	2026-10-16 07:33:15.652628+00	2026-10-16 07:33:15.357618+00	\N	\N
b64927af-03a1-46fe-a7ad-08d76b83a44e	44444444-4444-4444-4444-444444444440	aefd71db70305d9763d7463702380e50485d7a2ef451bef0b43e2098783fba71	2026-11-15 07:33:18.688173+00	2026-10-16 07:47:26.376783+00	2026-10-16 07:33:18.273019+00	\N	\N
a6be0f02-341e-4fc3-8cb4-e1ab243ab7bf	44444444-4444-4444-4444-444444444444	c283e2a7adda1c9353362525f9e7eee55678f1cb9c8c6e8f9c95dc5ed87f0060	2026-11-06 03:57:11.588211+00	2026-10-16 07:52:16.30955+00	2026-10-07 03:57:09.326518+00	\N	\N
d97fb568-7275-4df3-8932-073427d0b6ed	44444444-4444-4444-4444-444444444444	7bdd157721d32cacd5b9fd3ba9f4f6247cf2753c151d58465046649068dd3781	2026-11-06 03:57:21.588778+00	2026-10-16 07:52:16.30955+00	2026-10-07 03:57:19.317701+00	\N	\N
dda7e1f8-c320-4388-9b48-f86e1c3fed72	44444444-4444-4444-4444-444444444444	39159ee526e8cfa7aa1a8bb661ed1ab26ae6083d14ac27d4bf100cbd0a93d894	2026-11-06 03:57:27.969349+00	2026-10-16 07:52:16.30955+00	2026-10-07 03:57:25.698465+00	\N	\N
265ade6e-7fcb-4603-859d-abf217198dba	44444444-4444-4444-4444-444444444440	bd0674814636e08d83db88b4d63c9731264ffe44487a25fdf78f9b6dc901b263	2026-11-15 07:47:27.054555+00	2026-10-16 07:58:38.224844+00	2026-10-16 07:47:26.671764+00	\N	\N
bc355c86-8be0-47fc-a098-cec6ef143bdd	44444444-4444-4444-4444-444444444440	e96dfcc67edad8240e66ff6f963f2fdbe779bf21ac971e5e1dde540a15a4e1da	2026-11-15 07:58:38.834676+00	2026-10-16 08:13:42.516037+00	2026-10-16 07:58:38.483387+00	\N	\N
26da22c9-2525-4602-93bd-2bf0fd7924d5	44444444-4444-4444-4444-444444444440	65e6d37a32a0f22937fec5e34114c1dc6f2efc5016c5faa94d49bf12b5a2e772	2026-11-15 08:13:43.029122+00	2026-10-16 08:28:46.387133+00	2026-10-16 08:13:42.706124+00	\N	\N
1ed144bd-849a-48cc-bfa7-8fe62e1929a1	44444444-4444-4444-4444-444444444440	99daed6c6e19e3f6e373b3fc1ebd0413823502cc4090abcf7a3900389310360f	2026-11-15 08:28:46.860809+00	2026-10-16 08:31:57.610757+00	2026-10-16 08:28:46.584952+00	\N	\N
bf3ca11c-7784-4eb7-834a-d764972ec224	44444444-4444-4444-4444-444444444444	abc6aaf91104b3ee433ae980a8bc44e4348d19e839eb3e8a0b5a2333341dfca5	2026-11-15 08:31:59.679968+00	2026-10-16 08:33:40.986469+00	2026-10-16 08:31:59.414441+00	\N	\N
cc2d0989-8323-4fc2-8645-388f00c7f3e1	11111111-1111-1111-1111-111111111111	b26e0dae0ad1ddb5478caf4cad29bac793dc02f0d287f7ed59ae2299d10e55ae	2026-11-15 08:33:43.911961+00	2026-10-16 08:33:47.594258+00	2026-10-16 08:33:43.651463+00	\N	\N
ed538e56-5859-4c62-b0ed-3509364b397a	44444444-4444-4444-4444-444444444444	8004d9ca42185a1cce4c86d5ecea5bba718e25a8e58cc8fdc05c1c6432b8f6db	2026-11-15 08:33:49.616544+00	2026-10-16 08:47:02.135575+00	2026-10-16 08:33:49.356054+00	\N	\N
c362ede9-2f05-4445-ab29-7622dfcceb9f	44444444-4444-4444-4444-444444444444	319f2558336ed1ac4f07049b2dd63f834e27aaff478d5bda3f71ef33483a95d5	2026-11-15 08:47:05.519563+00	2026-10-16 08:48:02.941841+00	2026-10-16 08:47:05.296363+00	\N	\N
ddd45752-4a60-4271-9cfa-381f98d7a2de	11111111-1111-1111-1111-111111111111	3bbc5fe657838f34d424be3e7d38de2506e27d2f6e5872b4117be37b8f85a939	2026-11-15 08:48:04.895836+00	2026-10-16 08:50:06.110353+00	2026-10-16 08:48:04.675088+00	\N	\N
0d1d4546-a706-4270-888e-3d7f15253d74	44444444-4444-4444-4444-444444444440	b075d17fbedac6ee82cac1fafafed79bccfbf1063f7f1b7f20762ea848b20fdc	2026-11-15 08:50:07.931051+00	2026-10-16 08:55:39.313705+00	2026-10-16 08:50:07.724534+00	\N	\N
cd2fd4a3-fdd0-42d2-909a-064a24e9fa05	11111111-1111-1111-1111-111111111111	1fbe37e09b3e6cd8e46b150b118f2dffadb71f09c91ab4682a3cbf9f5f813fba	2026-11-15 08:55:43.934915+00	2026-10-16 08:56:24.655932+00	2026-10-16 08:55:43.737674+00	\N	\N
2987a8ed-e94a-44d9-b39f-34e5d99b2a38	11111111-1111-1111-1111-111111111111	08f676721d7b4f912fa6352eb1692253711472a387965f6c27895aeecbe1994f	2026-11-15 09:00:08.160632+00	2026-10-16 09:17:33.136186+00	2026-10-16 09:00:07.97537+00	\N	\N
7794d8a9-7912-4a55-adc1-02af761bbad2	11111111-1111-1111-1111-111111111111	00a5e52af97bb1e767a7d97b4fef98f6fb35ea64102a99a01b2f56460a6d231c	2026-11-15 09:17:33.474367+00	2026-10-16 09:28:23.799261+00	2026-10-16 09:17:33.338635+00	\N	\N
86b9e80a-dc93-4271-b2be-71b8525ae03b	11111111-1111-1111-1111-111111111111	3ffdde6bcd83969d77f31a457d2aa8df410f4da7c3a50f20e7b386776f9f04f0	2026-11-15 09:28:24.121871+00	2026-10-16 09:30:10.339258+00	2026-10-16 09:28:24.023513+00	\N	\N
51cde755-a7d3-43d3-91a7-98e70effb2a1	11111111-1111-1111-1111-111111111111	e8ff609b2b642e826edb5fad75c24a86e18799dc808dd74f7b94cc52cc3232a1	2026-11-15 09:30:10.660266+00	2026-10-16 09:30:42.252232+00	2026-10-16 09:30:10.565276+00	\N	\N
efccce3b-0b0f-4f7e-a603-a25fe3aee641	44444444-4444-4444-4444-444444444444	c208c56b43381d1c844812eee5b126f0bb77069d132389bc146f0fe7186bcceb	2026-11-15 08:47:04.274334+00	2026-10-16 09:44:34.838733+00	2026-10-16 08:47:04.051837+00	\N	\N
36186274-0d7e-44fd-9562-c19c6e186e21	11111111-1111-1111-1111-111111111111	985a23b236b70d7ae81dca4cd45155a0ece9688c377dad692c81e97f3a78b0a1	2026-11-15 09:30:42.606971+00	2026-10-16 09:30:48.296412+00	2026-10-16 09:30:42.512203+00	\N	\N
7183bbc5-2ae1-420e-aa2b-6795baa985b1	11111111-1111-1111-1111-111111111111	9ee40ee682b689834b1562a710dedf0b06430d923ba315de7247aaccb137269f	2026-11-15 09:30:48.623304+00	2026-10-16 09:31:02.259065+00	2026-10-16 09:30:48.529973+00	\N	\N
661e8a5d-ee9d-486b-aac1-1a2b9c35e6e8	44444444-4444-4444-4444-444444444445	3f4b8f35735176e413513ecbd6de0bddd41c2ac6057a69aa87d48c3090ad788a	2026-11-18 07:33:58.848477+00	2026-10-19 07:34:27.233665+00	2026-10-19 07:33:58.21369+00	\N	\N
fd34b60e-06ae-412e-be86-aca7ab1e46f7	11111111-1111-1111-1111-111111111111	483378b25d68b930512cd2c84aa1710a6a4c5b670fcfbe4d4d78f0fce5aa6402	2026-11-15 09:31:02.570418+00	2026-10-16 09:35:58.575478+00	2026-10-16 09:31:02.476362+00	\N	\N
b2f31493-652b-4a12-a320-7b19f5581e49	11111111-1111-1111-1111-111111111111	ea45a4f0a1a10abe9ae7229717d1e5469d3aa5fad7b4f22ad73a35cec5526891	2026-11-15 09:35:58.906512+00	2026-10-16 09:36:02.909555+00	2026-10-16 09:35:58.825107+00	\N	\N
d77fd5b5-7bf2-4e99-89bb-2d7ee4274e4e	44444444-4444-4444-4444-444444444445	03b43f3478cfc5f100952b60b173de166d7823d59ee1ddbc2592d81fc44da4f5	2026-11-18 07:34:28.078117+00	2026-10-19 07:37:02.81542+00	2026-10-19 07:34:27.446505+00	\N	\N
cdbc1632-a958-421e-9d5c-3cb2416844e4	44444444-4444-4444-4444-444444444445	a62f1f1b39809b93245919e29503142ee0c6fb0112315a7d09d803f6e34eeacb	2026-11-18 07:37:06.466116+00	2026-10-19 07:46:09.354444+00	2026-10-19 07:37:05.841571+00	\N	\N
0f06a18a-6d0f-438d-a403-54dc1fcb5e9d	44444444-4444-4444-4444-444444444445	f2751111eefbae73ca1c59368f2e866320c9bcdefb1d9c893b85fd922b79b4e0	2026-11-18 07:47:14.833162+00	2026-10-19 07:52:05.889348+00	2026-10-19 07:47:14.244866+00	\N	\N
69a64051-f3cc-4fbe-8ccc-8bc598363409	44444444-4444-4444-4444-444444444445	29ddbc44d8011bb34a9f82707a8ad532a063c88010608ab31b068521aed588ad	2026-11-18 07:52:06.671706+00	\N	2026-10-19 07:52:06.086888+00	\N	\N
438d2dfe-00d8-438b-90d0-26dc3a06641d	44444444-4444-4444-4444-444444444445	dab26ae76edbef43a5257a4e9eacecd1db77162630903753094e84be37bce871	2026-11-18 07:52:06.678108+00	2026-10-19 07:53:08.490844+00	2026-10-19 07:52:06.093407+00	\N	\N
9d022de0-7d03-45ac-a385-48c51de42334	44444444-4444-4444-4444-444444444445	3d2b5d99640969ed852781c074692d069c35d01bfa2de19eb3fb7380931cb38f	2026-11-18 07:53:09.272156+00	2026-10-19 07:55:13.300196+00	2026-10-19 07:53:08.690723+00	\N	\N
2207f842-4be7-41c6-9e07-f80cf6c4cf72	44444444-4444-4444-4444-444444444445	28eaaf284cf958408a07c372adcc90766e796000441f4e931e24fd9bb769b105	2026-11-18 08:35:19.741648+00	2026-10-19 08:35:23.57883+00	2026-10-19 08:35:19.27585+00	\N	\N
6d1a2370-91fd-48e4-be38-7cfa2f2f1389	44444444-4444-4444-4444-444444444445	2013fd8503b4232d680f9bddf118c91af7a8f05c2ea1669edb96a62986bd7d34	2026-11-18 08:35:24.244553+00	\N	2026-10-19 08:35:23.778426+00	\N	\N
7a6c46a2-73b9-46cd-90ca-f2f9ce34c253	44444444-4444-4444-4444-444444444445	b5f97752ceb7889a2550c31a8fe75d174981b97f05ba97bc6931cb4517729733	2026-11-18 08:35:24.260445+00	2026-10-19 08:35:26.897778+00	2026-10-19 08:35:23.794889+00	\N	\N
08869498-4420-4407-9043-34c8bef3613f	44444444-4444-4444-4444-444444444444	525f68327b5be2f04c8b697ad10aba9be1ee11f4e535c2de1ab5b630a9caf957	2026-11-18 08:38:55.970712+00	\N	2026-10-19 08:38:55.514363+00	\N	\N
7f5ac8d4-24ab-4d02-9430-ce20b9c3020d	44444444-4444-4444-4444-444444444444	60f26f2d24da3853814a7798c1a5d5d92d5579b9e9a7cdc846cb8ceb5db0779d	2026-11-18 08:39:03.004548+00	\N	2026-10-19 08:39:02.548341+00	\N	\N
eab35340-dbfb-4167-855a-2fa50f078389	44444444-4444-4444-4444-444444444444	f27b1ca1ec546bb771cfe98c888371cc116be1415e49d6feb3a1d138fcdcfca9	2026-11-18 08:39:12.362174+00	\N	2026-10-19 08:39:11.906091+00	\N	\N
8ce7651d-49f6-4e66-96fd-b8e9c278d2dc	44444444-4444-4444-4444-444444444444	241499034c46830c839d8c99f576011b073c5edf644e6510d1f5a466dd415b03	2026-11-18 08:39:20.65863+00	\N	2026-10-19 08:39:20.204233+00	\N	\N
918d00e3-b33f-4090-b119-1dd61ae84f28	44444444-4444-4444-4444-444444444444	a5d5467367acb54b0fe13a9bd53a0bcc6b6e7faef2f81f151cd8f34240a23d35	2026-11-18 08:40:05.117597+00	\N	2026-10-19 08:40:04.663944+00	\N	\N
d21bf39a-4811-430c-a606-0b4bb48b9e55	44444444-4444-4444-4444-444444444440	244d233c39ea28b33d102b8c7c45e242bd557f371c787033a63555d7e50ce902	2026-11-18 08:35:36.949018+00	2026-10-19 08:41:39.614849+00	2026-10-19 08:35:36.483863+00	\N	\N
c56be541-f781-47a3-8906-3a1f515a634c	44444444-4444-4444-4444-444444444440	9807019214903ee01529d3d78a2fa951b82795f38cfd36b78e09f5d451ff971d	2026-11-18 08:41:40.264894+00	2026-10-19 08:42:38.357603+00	2026-10-19 08:41:39.81579+00	\N	\N
a2e4057d-5001-4a86-b85e-c53b435d3b2d	44444444-4444-4444-4444-444444444440	8bb9421e1077a682dd1122c2cc7e0596ba9f4454798181160e80649dea320a3b	2026-11-18 08:42:39.030228+00	2026-10-19 08:42:49.884972+00	2026-10-19 08:42:38.586377+00	\N	\N
d2be7eb9-f551-4844-9dce-a648d0a04dd5	44444444-4444-4444-4444-444444444440	f01e96965e4cc19a91a08dcfb075b7aa2f89c88ee97899291082b9c6cf8a5886	2026-11-18 08:42:50.552208+00	2026-10-19 08:43:59.865702+00	2026-10-19 08:42:50.108482+00	\N	\N
4efc5345-70f3-461e-951c-8e2c93721ee6	11111111-1111-1111-1111-111111111111	be1e4321ea541517e0ecfa5a4a386c031dfbb865b1aaf687f22941adda4f145e	2026-11-18 08:44:02.51692+00	2026-10-19 08:44:53.297398+00	2026-10-19 08:44:02.086311+00	\N	\N
5b5ac089-0d08-457d-b092-493ce5911807	44444444-4444-4444-4444-444444444444	826ebeb3751b951d41df9879dbcfa67122724cf7260ad4c6adcd270ebd45530a	2026-11-18 08:54:35.194603+00	\N	2026-10-19 08:54:34.783502+00	\N	\N
0eceda9b-a52e-4c58-8e41-4c74ff61eb2f	44444444-4444-4444-4444-444444444444	a083942bd5120013bbe725c4bea571a4b762ddf832791ad056b0af084114b549	2026-11-18 08:54:50.396607+00	\N	2026-10-19 08:54:49.98665+00	\N	\N
84f04b84-6910-44fb-809d-fca703d72902	44444444-4444-4444-4444-444444444444	4d24bcd67e349a0e2d08a4a55a76949b2de6adf131e8b698c9867de1340debec	2026-11-18 08:55:00.363744+00	\N	2026-10-19 08:54:59.954114+00	\N	\N
b4c2c0f3-3cff-41bc-9f0f-adac609558a8	44444444-4444-4444-4444-444444444440	4c98388158e6d542e39eecba9225ef86ed8e0456e4cf4a50a524d5469819fee4	2026-11-18 08:44:55.851321+00	2026-10-19 08:57:34.93495+00	2026-10-19 08:44:55.411019+00	\N	\N
37929e9f-8dbd-49b6-bae7-861aca0671b4	44444444-4444-4444-4444-444444444440	1358fe3cb12c5c22eb6a0935a3c892e7aac1625e53fbbd378ae2808a6fbb80fc	2026-11-18 08:57:35.531332+00	2026-10-19 08:57:39.911696+00	2026-10-19 08:57:35.128706+00	\N	\N
954c2cde-9506-422c-b559-26ec8143e4b1	44444444-4444-4444-4444-444444444440	3da2a281fc300697dd0b7099e9c538f3fa40f7dbd5298d141d508a4caf192ae1	2026-11-18 08:57:40.545775+00	2026-10-19 09:04:27.34926+00	2026-10-19 08:57:40.15586+00	\N	\N
8a1fde52-9019-4cf7-9b69-a49396482767	44444444-4444-4444-4444-444444444440	31a286b52ac75dd201930649eeae905a29e9822cc873a564fa69cb70c7494303	2026-11-18 09:04:27.919428+00	2026-10-19 09:26:48.887594+00	2026-10-19 09:04:27.535186+00	\N	\N
0597c62f-1d3d-45ea-9c6c-42f40dbee66d	44444444-4444-4444-4444-444444444440	01de0f4f3fd4fb182ad98c940dea0b353a0ca85ccd39f888bc332cb0f2c927c3	2026-11-18 09:26:49.396332+00	2026-10-19 09:31:12.741397+00	2026-10-19 09:26:49.066475+00	\N	\N
a6bef7bb-4a68-4a50-a429-601e8a2da4a1	44444444-4444-4444-4444-444444444440	2cb7cebb76bb0ea34011bd294e3af255446033afdd48066faba6b2f3e0d35dea	2026-11-18 09:31:13.283484+00	2026-10-19 09:33:34.077619+00	2026-10-19 09:31:12.975854+00	\N	\N
942b97a1-b2d4-4dcb-8eea-38747a40d286	44444444-4444-4444-4444-444444444446	33c43d04c359a7ddecec38b24a00c744ad07c0307c295db41ea84943a5c4668e	2026-11-18 09:33:36.253945+00	2026-10-19 09:35:38.632465+00	2026-10-19 09:33:35.953132+00	\N	\N
57bcfbb4-4029-4b41-a399-7879aa63f98e	44444444-4444-4444-4444-444444444444	0af876fa3fa7addac938ec17b14becb2ae7078add209ed5101f65dff43e9f861	2026-11-18 09:35:40.887248+00	2026-10-19 09:35:53.707529+00	2026-10-19 09:35:40.581368+00	\N	\N
a9df51d5-3054-468f-acd2-13c3bb5051f9	11111111-1111-1111-1111-111111111111	3251813b98179477101578329c9f3a75cf5fd77c6058887d134d218726120e45	2026-11-18 09:35:56.089012+00	2026-10-19 09:36:11.807622+00	2026-10-19 09:35:55.784064+00	\N	\N
01461be2-a6ca-4514-bb95-90a033ed85a4	44444444-4444-4444-4444-444444444444	6075b81b4115d73e3bc61051d226ef067a83d2c9b0fdbf76060cb6cd633d1def	2026-11-18 09:36:14.506118+00	2026-10-19 09:43:23.116087+00	2026-10-19 09:36:14.201682+00	\N	\N
0e6d7dff-58e0-4565-84e5-510605dbd931	44444444-4444-4444-4444-444444444444	70d2738235c97c749f03a4bab3e6c2b257b7473778800122a31332e300ebacc6	2026-11-18 09:43:23.587613+00	\N	2026-10-19 09:43:23.305262+00	\N	\N
ea789b5c-8962-4647-94e8-43d977287618	44444444-4444-4444-4444-444444444444	8d7807936944370c595c638db26bbbbc523f84491facacf502dc630e9f710eaf	2026-11-18 09:43:23.587613+00	2026-10-19 09:47:42.899512+00	2026-10-19 09:43:23.303956+00	\N	\N
79553c69-427f-432f-bb81-1f238ece5310	44444444-4444-4444-4444-444444444444	60e66ab13967914e67fedaa624b293e0ab8b2646804e7987f7555ec5fc14a571	2026-11-18 09:47:43.351085+00	\N	2026-10-19 09:47:43.079086+00	\N	\N
839d7b8a-c673-4e30-8871-b57e25b558dc	44444444-4444-4444-4444-444444444440	2413ae6f00cbf946c72fd54ae399b72ff9fc64387446715666e4a09c84b97265	2026-11-18 08:41:40.258896+00	2026-10-20 05:25:25.567283+00	2026-10-19 08:41:39.810053+00	\N	\N
56dbe635-366e-48f9-95c3-1fd426654c12	44444444-4444-4444-4444-444444444440	5b620d2ef260e374229ddfd6e39df8acb53003912b6642fb3e297d74a59d0ac6	2026-11-18 08:42:50.540811+00	2026-10-20 05:25:25.567283+00	2026-10-19 08:42:50.09513+00	\N	\N
898a5a71-afd1-46d7-ac2c-34200a0d27bb	44444444-4444-4444-4444-444444444440	62094bc62434ba121f842c6f23cf183e69d2b860153148f1cd486a2b6a8f4d46	2026-11-18 08:54:34.373041+00	2026-10-20 05:25:25.567283+00	2026-10-19 08:54:33.962587+00	\N	\N
11cc5906-7154-47ce-90b4-9abc8c8b8ba3	44444444-4444-4444-4444-444444444444	2b391fdce70005909e91a2b013a68c87740164ad4c62a295f3a84e8fe4a2179d	2026-11-15 09:36:05.074615+00	2026-10-16 09:44:34.37827+00	2026-10-16 09:36:04.992172+00	\N	\N
514a490d-5185-414e-baba-cccafc445635	44444444-4444-4444-4444-444444444440	3c6b342234709971be831fad0a6a77a482d91cabe83888ac37962e5ed68212c1	2026-11-18 04:28:07.215909+00	2026-10-19 05:03:31.530845+00	2026-10-19 04:28:06.957609+00	\N	\N
12fa5ffa-704c-4955-bfa8-1b654c8b6f5e	44444444-4444-4444-4444-444444444444	536a6e92e833099d26cab0a2eb4ab8ea370f3d219d26ecce363e978c4e0d5c1f	2026-11-15 09:44:34.648818+00	2026-10-16 09:44:34.838733+00	2026-10-16 09:44:34.576875+00	\N	\N
0dff3ec8-1d80-42d9-9af6-ead14e038ba8	44444444-4444-4444-4444-444444444440	f7633cad6cb73a97b506fa522c784fe092efc77836e4c682e8f4497fdab4332b	2026-11-15 09:44:39.116051+00	2026-10-16 09:44:44.156074+00	2026-10-16 09:44:39.045843+00	\N	\N
5899e343-94df-407f-9949-96cdf18d2862	44444444-4444-4444-4444-444444444445	bb98ed8b071bd3c539da173e1a03b46a3be25fb87a4856f17ba2cc419afaf12c	2026-11-18 07:46:10.198696+00	2026-10-19 07:46:43.671844+00	2026-10-19 07:46:09.608235+00	\N	\N
89c84ede-5b88-4f4d-8cf4-bc26a206f3c9	44444444-4444-4444-4444-444444444444	7482ad2c2758138f285f8ebc12ac71158ce2074b52c4f775ee9b6298f0a7ad83	2026-11-15 09:44:45.799534+00	2026-10-16 09:45:49.664343+00	2026-10-16 09:44:45.72983+00	\N	\N
933b3de3-8c9b-4982-8c2c-10a3aa051609	44444444-4444-4444-4444-444444444445	c02902b1311f6359edc65e6f5e38492345ffd569c371eeec36172edbe780e989	2026-11-18 07:53:09.269689+00	\N	2026-10-19 07:53:08.688774+00	\N	\N
0e0ad026-4329-47fb-bb5d-c802965a3603	44444444-4444-4444-4444-444444444440	1f456740be152e6df47f66a497a3b63c1ddcbca8164b3c2204c8418ce24befce	2026-11-15 09:45:51.476174+00	2026-10-16 09:51:45.375241+00	2026-10-16 09:45:51.416701+00	\N	\N
71b08a45-867b-4194-8346-b549c077d7e9	22222222-2222-2222-2222-222222222222	a88b561e92884d2685cedf13947a7d1a73592dac6b4c6117a694d6524fd98c2f	2026-11-18 07:55:17.128786+00	2026-10-19 07:55:18.770479+00	2026-10-19 07:55:16.554004+00	\N	\N
34187860-7b8f-4e5e-986b-8da9a806ebfc	44444444-4444-4444-4444-444444444440	0b9ac83e64bed1da500f1f71a3301970f3eb9e9e64e51702ec6bfb8183a79e1a	2026-11-15 09:51:45.640972+00	2026-10-19 02:11:28.044875+00	2026-10-16 09:51:45.597184+00	\N	\N
d786439e-2fef-4f8e-9c9c-bcb5a5ce65d6	11111111-1111-1111-1111-111111111111	8773c8a9e57d3698ff440d95b83f66558e90f8ad3f25702ba6d5c7b14e189736	2026-11-18 07:55:20.970294+00	2026-10-19 07:55:22.276452+00	2026-10-19 07:55:20.394787+00	\N	\N
d39de9ed-df90-42cc-ab3e-180a13f310e8	44444444-4444-4444-4444-444444444440	40ba7cf8e9ab8c0ea99745e805fed446a75c7447a8c5136315f599a78d9fa190	2026-11-18 02:11:28.09247+00	2026-10-19 02:31:48.030145+00	2026-10-19 02:11:28.274539+00	\N	\N
4180d022-81f0-49a0-b0cd-8bb1b730011b	44444444-4444-4444-4444-444444444440	d2ba9dd82f0c09d49a17706f2c90c3116e3f0acc1d0c8c244e81bc7ac851a3d5	2026-11-15 07:47:26.976277+00	2026-10-19 02:31:48.572888+00	2026-10-16 07:47:26.596577+00	\N	\N
aa695ce0-780a-49ab-9f3b-26b149aae727	44444444-4444-4444-4444-444444444440	b48c139055b8de4bc38edbfe96019519a7bcebd4ef794e6aa21e35a104559292	2026-11-15 07:58:38.780135+00	2026-10-19 02:31:48.572888+00	2026-10-16 07:58:38.416736+00	\N	\N
d51d9d08-d157-49eb-9cfa-8c1a1083b0b3	44444444-4444-4444-4444-444444444440	5218236ac4195c909aa07232e24841512f24ab2ce61268aa581fb5f030c521cf	2026-11-15 09:51:45.625949+00	2026-10-19 02:31:48.572888+00	2026-10-16 09:51:45.574207+00	\N	\N
601624bd-5a5c-4863-89de-c348d24146b9	44444444-4444-4444-4444-444444444440	3e4712a104b5bab18742ec6abc7f33d02208de7f57e49ffb459b254b8398201e	2026-11-18 02:11:28.086893+00	2026-10-19 02:31:48.572888+00	2026-10-19 02:11:28.270275+00	\N	\N
14526391-7909-4171-97c2-639680cc7323	44444444-4444-4444-4444-444444444440	6fcaba93a395cc5ca995b771729e3acd314883b3f45d1098dff44da3f8d9ad8a	2026-11-18 02:31:47.989923+00	2026-10-19 02:31:48.572888+00	2026-10-19 02:31:48.233792+00	\N	\N
63e041da-8bf9-4b4c-b443-fbea03d24d97	11111111-1111-1111-1111-111111111111	d6c509634967335e0e17ca8754df7bfc331a4d09e9c18f62b270ed121763d3a0	2026-11-18 07:55:25.599946+00	2026-10-19 07:55:55.631753+00	2026-10-19 07:55:25.035742+00	\N	\N
400641e0-e62a-4e44-b332-fe43beac0ffa	44444444-4444-4444-4444-444444444440	fb93ad2c269bdba25f90ae31889770cf683911c0c463069f3fa14c081a4b8a75	2026-11-18 02:31:51.168454+00	2026-10-19 02:36:10.034073+00	2026-10-19 02:31:51.422023+00	\N	\N
8e9ffdc7-93ba-4760-b6a8-9aab74868b7a	44444444-4444-4444-4444-444444444440	ba57aebdf02965eef6196ee0606b6e9ac73931390b49cb2a5b262924387569d7	2026-11-18 07:55:59.462501+00	2026-10-19 07:59:36.464583+00	2026-10-19 07:55:58.888142+00	\N	\N
b6184651-16dd-4fe1-ac9a-e0007e54d936	44444444-4444-4444-4444-444444444440	2710ce74492bba6fd887dc53cfb8198a1a784647d15e61f2a5c2b556ad537dca	2026-11-18 02:36:09.986408+00	2026-10-19 02:42:17.072432+00	2026-10-19 02:36:10.252967+00	\N	\N
e793d9d5-032c-4447-ba23-42d54383cc24	44444444-4444-4444-4444-444444444440	5d89e019b5fc84396b4c3133be0179f7e7d653d9ee2b92191812c419b2048531	2026-11-18 02:42:17.036699+00	2026-10-19 02:58:20.102326+00	2026-10-19 02:42:17.320453+00	\N	\N
de386aa9-87fc-44af-85d6-c4730250ba81	44444444-4444-4444-4444-444444444440	3f7ce11615366262fb143e0da77e6ae9e4c249914b6cddc11db7ef7d00b70916	2026-11-18 07:59:37.277598+00	2026-10-19 08:01:03.007153+00	2026-10-19 07:59:36.723879+00	\N	\N
156168c9-f140-4755-ac28-abe708f84f73	44444444-4444-4444-4444-444444444440	252c88e7d9bd11a97ada9d1392fda5bf81b2cc7ec14c539f65329b03eb76225d	2026-11-18 02:58:20.00503+00	2026-10-19 02:58:23.236168+00	2026-10-19 02:58:20.335062+00	\N	\N
793c5654-b76c-42c6-a4d3-642b9ae8db9e	44444444-4444-4444-4444-444444444440	c2eaa6ff66f90b7638fe652fbaf7a5b595e5156d5a16e8c7dc62ba214ae8f916	2026-11-18 02:36:09.985906+00	2026-10-19 02:58:23.659004+00	2026-10-19 02:36:10.252174+00	\N	\N
1972134d-3706-4ba3-b856-3ffb6d847e67	44444444-4444-4444-4444-444444444440	2f213fb3f1a69cb1ddf43d38309a8c9fab44a7f3c706aa18e7641e63526ad6b7	2026-11-18 02:42:17.002142+00	2026-10-19 02:58:23.659004+00	2026-10-19 02:42:17.275982+00	\N	\N
3b08beec-f7f4-4c87-bea2-788a7201c0f2	44444444-4444-4444-4444-444444444440	98f5fd9d9bd322696384850232a1f15813c443d9ea82385dfda2a8440ff82aa8	2026-11-18 02:58:23.130917+00	2026-10-19 02:58:23.659004+00	2026-10-19 02:58:23.460347+00	\N	\N
92cb5b20-334d-4d72-a617-52a5bf0bc4eb	44444444-4444-4444-4444-444444444440	a66213c1789b232b0a06028aebcbc3f54f0fecbe709adbb31126950b20931754	2026-11-18 02:58:25.736113+00	2026-10-19 03:13:31.762345+00	2026-10-19 02:58:26.065826+00	\N	\N
fd90a3aa-fe3d-45bd-8f59-28f7c9fff2c9	44444444-4444-4444-4444-444444444440	8baf15a85463a6d7a80d4923fc4a0fbaaac6452f307d15ab80fee08d2d696da5	2026-11-18 08:01:03.78889+00	2026-10-19 08:04:52.238174+00	2026-10-19 08:01:03.239269+00	\N	\N
daa5c32f-cc38-4c9f-a125-94806da51e87	44444444-4444-4444-4444-444444444440	762af0cd9706feadf371e8b3ad5b5c5a3e60658a9a10f43a0f394cda06b29dd2	2026-11-18 03:13:31.606615+00	2026-10-19 03:18:21.713889+00	2026-10-19 03:13:31.970238+00	\N	\N
cbf93890-026b-4a9b-84e4-ff6b1c4ab130	44444444-4444-4444-4444-444444444444	6eb2a6fecd278e2ba1005d46257882710eeb886121e1d3f344417699a98ccb46	2026-11-18 03:18:23.440338+00	2026-10-19 04:11:36.591857+00	2026-10-19 03:18:23.82476+00	\N	\N
449ef777-950b-4c94-a545-57a69717a2c3	44444444-4444-4444-4444-444444444444	b1b294e5097e31e5ac05d6a0725569220b0b4cd948d55384405926df9c8ee74f	2026-11-18 04:11:37.093875+00	\N	2026-10-19 04:11:36.778731+00	\N	\N
563ebeb4-a01c-4e2d-944e-3dfa9ba19669	44444444-4444-4444-4444-444444444444	ddd3604cf611e8a7e83fd251267f1f74b2e73a354f1292da5249ec59e9935015	2026-11-18 04:11:37.223915+00	2026-10-19 04:12:03.316251+00	2026-10-19 04:11:36.912192+00	\N	\N
8a834817-2518-49b3-9f67-4583c9b107f9	44444444-4444-4444-4444-444444444444	8010a8859a5c55e824f58e771dfd433b5698f7e206066b0d77532e0b7ce8a0eb	2026-11-18 04:12:03.808032+00	\N	2026-10-19 04:12:03.49412+00	\N	\N
1c28d87d-d844-4633-b042-f92e25fb23a9	44444444-4444-4444-4444-444444444440	551277fb06d9f037213592b6d19a6fbdf5202cb975992c9ba8206cfa86766bbb	2026-11-18 08:04:52.989257+00	2026-10-19 08:06:49.805769+00	2026-10-19 08:04:52.439513+00	\N	\N
3a85ddd9-0f5a-4c52-ba88-76a58034347f	44444444-4444-4444-4444-444444444444	e523ec6d5f9912d92f9c986653de4a76a1271bc0f5a742e2700f89fb81f6d097	2026-11-18 04:12:03.892055+00	2026-10-19 04:12:31.122949+00	2026-10-19 04:12:03.581612+00	\N	\N
f6ecca5b-5926-438c-82a7-abec6ea5436b	44444444-4444-4444-4444-444444444444	6f50378cc4636d64a0f1444aeb399b0bbf9326400848667e6009dd2d342cfc95	2026-11-18 04:12:31.639697+00	\N	2026-10-19 04:12:31.330514+00	\N	\N
1f943c8d-95b5-4e90-b19b-dd41781adaef	44444444-4444-4444-4444-444444444445	51d92cb7416d7f49988af527e53fc219eb922b2a58f75d1d61818ee2a0351511	2026-11-18 08:06:59.971397+00	\N	2026-10-19 08:06:59.427357+00	\N	\N
f5da11bc-29e0-404c-b4bf-a49cdc29a62c	44444444-4444-4444-4444-444444444444	861cc6b493ddab2301763276cf1e18685eda0c29b7c55eb59ba64d57ec5351af	2026-11-18 04:12:31.656291+00	2026-10-19 04:12:51.24384+00	2026-10-19 04:12:31.353772+00	\N	\N
5bbca97f-2c84-4834-9044-04276bc3ff49	44444444-4444-4444-4444-444444444440	391599cdc95ba48dafec53900774afa81d56f2b97e6804143dd022e11f0f4584	2026-11-18 04:12:54.823691+00	2026-10-19 04:13:00.223855+00	2026-10-19 04:12:54.521348+00	\N	\N
449862c5-5962-4bb5-8e41-0b3e7ebe809a	44444444-4444-4444-4444-444444444445	4a33ffdde2f410eb8168b4b9db562dea049d6a57018d3b713e1a257f4c3ce688	2026-11-18 08:07:00.018383+00	2026-10-19 08:35:19.049076+00	2026-10-19 08:06:59.484862+00	\N	\N
f505d827-db8b-4514-877d-dca9a22bea3e	44444444-4444-4444-4444-444444444440	a6b01dbd69b3a7093b99f31195695ceb327f7c67911c096468ec739706ef92f4	2026-11-18 04:13:02.158808+00	2026-10-19 04:18:50.407684+00	2026-10-19 04:13:01.848783+00	\N	\N
f3fae52a-9ce8-4527-83c7-7f35cae20695	44444444-4444-4444-4444-444444444440	40a52f17b323b3be31e7d0678e88ef30c4c207d9f63112ff67f1e46e48491ded	2026-11-18 04:18:50.914244+00	2026-10-19 04:28:06.703125+00	2026-10-19 04:18:50.620167+00	\N	\N
477aa136-cab1-40cc-a8f3-af6da100c3ed	44444444-4444-4444-4444-444444444445	e7d39b4f585126dc2d39592a3a2e1b71e3639e18b005814a0515d45f93ee7337	2026-11-18 08:35:29.222691+00	2026-10-19 08:35:34.359749+00	2026-10-19 08:35:28.757384+00	\N	\N
d1facc58-454f-4e25-8d34-68198b63ab1a	11111111-1111-1111-1111-111111111111	61b8fcdf18c5d4983b95226b5e5a2697c975be5aba1c390f4bdde4a3e86ee543	2026-11-18 04:12:54.194367+00	2026-10-20 01:41:11.187106+00	2026-10-19 04:12:53.882617+00	\N	\N
4ec92b1a-1dec-4379-9dc6-25645a198ed2	44444444-4444-4444-4444-444444444440	60d5aab3a29ef228a54393fc3d502787c8e15297d3dd5df48ca08a3bcad6936d	2026-11-18 04:18:50.903632+00	2026-10-20 05:25:25.567283+00	2026-10-19 04:18:50.606989+00	\N	\N
b994c4a4-6fa7-44fa-9066-2a918ad78dee	44444444-4444-4444-4444-444444444444	a3125ca6906a891046aaf998b7d2b08bf65e3aa9f0503887557e70e3d50475fa	2026-11-18 09:47:43.426132+00	2026-10-19 09:47:59.702476+00	2026-10-19 09:47:43.151358+00	\N	\N
cf2f9e5e-9bd0-4d1a-91b4-92f1b591c10b	44444444-4444-4444-4444-444444444440	64a5ca7db11e9a94ca66ce0c1678b155e2db1efdd983177e405b79b95e6b684e	2026-11-18 09:48:02.178787+00	2026-10-19 09:48:11.23876+00	2026-10-19 09:48:01.905859+00	\N	\N
14c54b5e-5691-4d3d-82c6-3a2cac1fe102	44444444-4444-4444-4444-444444444445	c78adcca6ab795a6aa2bc848a92f63b549f48293ddd39225ef68e1716b44ae05	2026-11-18 09:48:13.486+00	2026-10-19 09:48:20.350334+00	2026-10-19 09:48:13.21642+00	\N	\N
849b1d86-3702-41ce-bd80-a1e10e4b1446	44444444-4444-4444-4444-444444444440	24b1afde73ca78126c732d2e93a7351a383ecc35290947aa909c397bf3df18d9	2026-11-18 09:48:24.659531+00	2026-10-19 09:48:37.19895+00	2026-10-19 09:48:24.390582+00	\N	\N
dfc7c678-3c4a-4204-94e9-b00637c804ca	44444444-4444-4444-4444-444444444445	7bbdc314c7749c82680c7212f086ed752115bd7a9d0cd9c2e8bffc25a13c1b6d	2026-11-18 09:48:39.228546+00	2026-10-19 09:48:50.907069+00	2026-10-19 09:48:38.95905+00	\N	\N
823388d4-0034-4bd4-9379-8f9dc836109e	44444444-4444-4444-4444-444444444445	d974aa188b36320859d55f766d3b24c01a6a4abb33ddea37e71d92dcfa7b0ddd	2026-11-18 09:48:51.352878+00	\N	2026-10-19 09:48:51.081968+00	\N	\N
fff0a237-c5ca-4bb0-986f-882371c54911	44444444-4444-4444-4444-444444444445	8068bb5adba640c4fe7a8f6eb7816e2bd1f125a6cabdf6a0339fed07677cbff5	2026-11-18 09:48:51.363312+00	2026-10-19 09:49:30.252326+00	2026-10-19 09:48:51.094365+00	\N	\N
e6a2dfdf-37a4-476c-8a34-e04cbb4a084b	11111111-1111-1111-1111-111111111111	7cf34b47011a0ee51b50127680b9e43c2ff7b2841ae4cd3741ec892827b7b457	2026-11-18 09:49:32.015138+00	2026-10-19 09:53:18.238381+00	2026-10-19 09:49:31.745157+00	\N	\N
02006602-f6d8-4f57-8a8c-c2ff570c6d95	11111111-1111-1111-1111-111111111111	152d2cfd88673d1180466b6eae36ba5933bb7bb7c444688255e9d708fde6d8ee	2026-11-18 09:53:18.673674+00	2026-10-19 09:54:57.668356+00	2026-10-19 09:53:18.41437+00	\N	\N
fcac7b82-148d-4aeb-b4d5-120ba626834d	44444444-4444-4444-4444-444444444440	ee5468f2f7b45ce17881ebfb713e207aeb8c352b9d290c2c100a2ca07ebd33d0	2026-11-18 09:54:59.568562+00	2026-10-19 09:55:08.679023+00	2026-10-19 09:54:59.313138+00	\N	\N
c4a62347-1e9b-4279-8da0-d80e3097c014	44444444-4444-4444-4444-444444444445	7da47e4e89f0cfa7ef9c0e71053e7a40c335d85d873712541faaa58682a36591	2026-11-18 09:55:10.479934+00	2026-10-19 09:55:15.918015+00	2026-10-19 09:55:10.228324+00	\N	\N
6395b27f-90b4-4f1f-8a6f-2038f33ce35b	44444444-4444-4444-4444-444444444445	4f068411457210af44b19bc3cfc33ace91cfd8b5137968971e68c761992ea437	2026-11-18 09:55:16.346672+00	\N	2026-10-19 09:55:16.092081+00	\N	\N
56c7db92-ae3f-4884-bf82-50b2e2fbd661	44444444-4444-4444-4444-444444444445	275ad2ec89ffd57378306e10564dcbbcef222af4d3654538fda4a2d2f6a9e23b	2026-11-18 09:55:16.360681+00	2026-10-19 10:00:44.72538+00	2026-10-19 09:55:16.109756+00	\N	\N
566b7b78-de17-41f2-92a7-15eb2c7d778a	11111111-1111-1111-1111-111111111111	b7211c9951b7756114b581792ebc064d2e1d5b504786734d0d26b55fd110c0db	2026-11-18 10:00:47.178002+00	2026-10-20 01:41:10.726131+00	2026-10-19 10:00:46.938893+00	\N	\N
cce5af1a-ccb3-47c9-922f-9152a9ed8437	11111111-1111-1111-1111-111111111111	15db395f0ace9e8f0232f16d881d22227ab5c793b18b17075f6ad6e8a3338c3b	2026-11-15 05:58:06.404763+00	2026-10-20 01:41:11.187106+00	2026-10-16 05:58:05.793283+00	\N	\N
7e5baf0d-7803-4b3a-afbe-ab425d9f613b	11111111-1111-1111-1111-111111111111	435cfdd62115b8d7dac73f5391cdc5623addea6ea0e7f5fd90c98ad14df4e9e1	2026-11-15 06:34:33.16462+00	2026-10-20 01:41:11.187106+00	2026-10-16 06:34:32.640716+00	\N	\N
c1d449b5-fb1e-483d-8014-3e328c72ba26	11111111-1111-1111-1111-111111111111	016f86c5719967daa39a78826aeb306e19817e3d4ce6e729cd2cab12d92e1bd6	2026-11-15 06:55:13.810648+00	2026-10-20 01:41:11.187106+00	2026-10-16 06:55:13.343513+00	\N	\N
256d5431-ca52-4fab-854d-bfaedd92c65a	11111111-1111-1111-1111-111111111111	a3c97e5509fb8088e11b512eee13bf01741b4bd0898d3cc43155bd6d36814950	2026-11-15 09:28:24.115789+00	2026-10-20 01:41:11.187106+00	2026-10-16 09:28:24.015857+00	\N	\N
f6936e6c-2e8f-40ed-b6cb-63ed0bb5d351	11111111-1111-1111-1111-111111111111	f53fe8942bc51de37e164515ad9281c30009532554b9dfcb056a90f016fb92b1	2026-11-15 09:30:10.655265+00	2026-10-20 01:41:11.187106+00	2026-10-16 09:30:10.559205+00	\N	\N
36fb1fa2-6ddc-449f-a735-926e04b1a55d	11111111-1111-1111-1111-111111111111	28d2808b51b04a549c27eada4476710233243e342e8eeb542c88269103c45bbf	2026-11-15 09:30:42.549732+00	2026-10-20 01:41:11.187106+00	2026-10-16 09:30:42.444367+00	\N	\N
86c8f881-477e-4237-a08b-03d593020fc4	11111111-1111-1111-1111-111111111111	4094f59dfee09b5c3114f648854744f287dc3d5609ee3edb081558ec338502c8	2026-11-15 09:30:48.611956+00	2026-10-20 01:41:11.187106+00	2026-10-16 09:30:48.517057+00	\N	\N
833223d8-b8f3-467d-92a2-4270e62e8f44	11111111-1111-1111-1111-111111111111	0170a7ed474b8d39ffc2fce2001a5f4fe9078898d0e86ec95535be1ce599a2bc	2026-11-15 09:31:02.565737+00	2026-10-20 01:41:11.187106+00	2026-10-16 09:31:02.470755+00	\N	\N
dc087bc8-cb2f-4df6-a2e2-949526b74fe9	11111111-1111-1111-1111-111111111111	84d5006a69e52d0b74b90fd3bd8415e4fb087b9025bb06ee50756060f7a99613	2026-11-15 09:35:58.864987+00	2026-10-20 01:41:11.187106+00	2026-10-16 09:35:58.773048+00	\N	\N
f4979ddf-1f71-4f8f-a3d8-0b4086f83350	11111111-1111-1111-1111-111111111111	0e480028390e7c24e6e5c26b1a98d21b238176e8434713ed76fa4be4583b0cc6	2026-11-18 08:40:04.25564+00	2026-10-20 01:41:11.187106+00	2026-10-19 08:40:03.801872+00	\N	\N
bcbea960-7384-407a-b01c-1d57f15328a6	11111111-1111-1111-1111-111111111111	7614320dca242ebb40b5dc9d235a2487069e5c03d07f8dd553b697e971384d0c	2026-11-18 09:53:18.672673+00	2026-10-20 01:41:11.187106+00	2026-10-19 09:53:18.412857+00	\N	\N
e0c887e7-f7f9-493d-a293-b0bc51d3cb0d	11111111-1111-1111-1111-111111111111	1bfb9618c3b423c8205189376590c0860de30ec91fa3653ffd76ec5f6b6c1cb4	2026-11-19 01:41:11.881513+00	2026-10-20 01:41:11.187106+00	2026-10-20 01:41:10.938599+00	\N	\N
ba3ecf9e-7938-4884-b1fb-5193dfaada69	11111111-1111-1111-1111-111111111111	9e3e996d075f69ae75e17549ae15aaa8cb48fb25300d34b1f853fa48c4e0d31c	2026-11-19 01:41:20.787131+00	2026-10-20 01:41:31.957142+00	2026-10-20 01:41:19.843952+00	\N	\N
222fda78-5132-4681-96b5-4b1803293597	44444444-4444-4444-4444-444444444440	5a49bafa87bbe70bd874d26bed49a58bbda7792a6c1c42bf95a03f14c2cd9209	2026-11-19 01:41:35.020467+00	2026-10-20 01:42:57.896514+00	2026-10-20 01:41:34.089827+00	\N	\N
623109d1-a93b-4e08-b2be-b28447b41c6c	44444444-4444-4444-4444-444444444446	56026eacd744940d6e16ff9651ddd11559a0ed7b33560fa76343d3d711048339	2026-11-19 01:43:00.120635+00	2026-10-20 01:43:01.692586+00	2026-10-20 01:42:59.181041+00	\N	\N
8450da2d-6479-49d4-b686-ee5525f37c16	44444444-4444-4444-4444-444444444444	5cac48f3193fd58573200f1ccdd0f9e2f649e62fde449bd3026445de9114cb64	2026-11-19 01:49:12.903447+00	\N	2026-10-20 01:49:11.988659+00	\N	\N
de2ad28f-f3d7-462e-9bef-4fa188074268	44444444-4444-4444-4444-444444444445	a9541e9a9e778e9d2a70d69825ea5adabe5a7ec110bd5a8770ea8cf813d9a686	2026-11-19 01:49:19.41546+00	\N	2026-10-20 01:49:18.500956+00	\N	\N
c77224ac-0077-430d-8fcf-19cf251f0c29	44444444-4444-4444-4444-444444444446	87fa01a7d31f969d61c488b9da8bd186bcd2cd43b438baf0abdf2cb969185d9b	2026-11-19 01:43:02.832612+00	2026-10-20 02:35:26.739526+00	2026-10-20 01:43:01.893536+00	\N	\N
1ca0d222-b548-4b96-8b87-aa8aa43685c5	44444444-4444-4444-4444-444444444446	d88a111ac509b581c40aa303d2dd2955aeaafb1c4c6dcdbdeec6375e8dba818c	2026-11-19 01:43:02.829293+00	2026-10-20 03:07:43.743056+00	2026-10-20 01:43:01.899248+00	\N	\N
a446fef9-d5bd-47d3-9d4b-f21aa236782f	44444444-4444-4444-4444-444444444446	0ec8286df39abbbf44bbb66a37ba8d8776f52f572ec62d95acbb2c80e251c5cc	2026-11-19 01:49:32.891018+00	2026-10-20 03:07:43.743056+00	2026-10-20 01:49:31.977114+00	\N	\N
d57d976a-9e36-41ac-9fd3-f8bb17db03fe	11111111-1111-1111-1111-111111111111	722a59ba5f2d4775cb71a5306fb9a437c75855e42c81ed2b2caba1ef0ec35708	2026-11-19 01:49:25.701789+00	2026-10-20 09:19:58.018019+00	2026-10-20 01:49:24.787906+00	\N	\N
a987b7ec-b4a6-4fdb-baa6-9ac13c45405a	11111111-1111-1111-1111-111111111111	b47f9e46a4d616cb01ae35c7e71f2fe04f0ff3088a5dc378ddb538860ba810fe	2026-11-19 01:49:57.165932+00	2026-10-20 09:19:58.018019+00	2026-10-20 01:49:56.253328+00	\N	\N
70d2434a-24ac-4ddb-b9a1-3d4ebddc003e	44444444-4444-4444-4444-444444444446	fb25db2055f01f8905ad372c72134e1bf7f4da0bf8907a6e69b07f10e57798fc	2026-11-19 02:35:28.055676+00	2026-10-20 03:07:43.231248+00	2026-10-20 02:35:27.231602+00	\N	\N
40b2271f-c0eb-48e7-9a77-825abfc2a653	44444444-4444-4444-4444-444444444446	f7f019ad7c0d512ddafed7c5e62403daa419d06a6d2145e7e6f0b9ad5d229b8e	2026-11-06 08:49:43.177126+00	2026-10-20 03:07:43.743056+00	2026-10-07 08:49:41.772008+00	\N	\N
18cda2bb-0e04-4691-b77c-0866e04c6028	44444444-4444-4444-4444-444444444446	2322f6bc75976a8dcbfb1818fc6db75b2021e6529998e5ef932c3b0e42098add	2026-11-19 01:52:02.544144+00	2026-10-20 03:07:43.743056+00	2026-10-20 01:52:01.626776+00	\N	\N
bd28e683-b795-4b7e-a583-42c9131efb6d	44444444-4444-4444-4444-444444444446	5fa52d7f5dbff856e3805a7d66179d5ecfa62e566c99c5a5da108dd6c843cefc	2026-11-19 01:53:06.867992+00	2026-10-20 03:07:43.743056+00	2026-10-20 01:53:05.953113+00	\N	\N
98450c07-c24d-4b1b-8a56-f8274749ae22	44444444-4444-4444-4444-444444444446	cee6368f0c527df2d2b94dc73f40e9ca093663d2c92c72bc33d0c89e56756ca3	2026-11-19 02:35:27.760226+00	2026-10-20 03:07:43.743056+00	2026-10-20 02:35:26.923824+00	\N	\N
039c0b39-3856-427e-970a-f64f6af13557	44444444-4444-4444-4444-444444444446	7285e54cea16cdd9120e94b1b51fd879767f10a9d23244b28fcbe43fb4d408ec	2026-11-19 03:07:44.165863+00	2026-10-20 03:07:43.743056+00	2026-10-20 03:07:43.418532+00	\N	\N
69d08e72-4f32-49ce-91b4-91a8b6f421f7	44444444-4444-4444-4444-444444444446	d7c0f54d2d33bd6ce19ba12040973448948b5856b3d8b6bb7bdbca270c71d556	2026-11-19 03:43:12.994111+00	\N	2026-10-20 03:43:12.341151+00	\N	\N
a31d889a-085f-402f-be01-3aa6e93b48ba	44444444-4444-4444-4444-444444444446	320c93ea0afbdc281d67723d92bb220e22a66905cfb56ed812267c92765024b3	2026-11-19 03:46:39.257491+00	\N	2026-10-20 03:46:38.62047+00	\N	\N
53a6201d-05ad-41bd-9c80-6e80bb4d2683	44444444-4444-4444-4444-444444444446	18c097b38b23ea42b57ba86364589c503ffd9a20793c56da5559bdea166ae36a	2026-11-19 03:46:47.388762+00	\N	2026-10-20 03:46:46.752386+00	\N	\N
8572c1cc-bdb1-495c-9c30-208ee66d6b01	44444444-4444-4444-4444-444444444440	80cef1662ed25fd8fd0b4b8b85092b00ec7ac1fcd1e391e2b8a24daa7c30afd8	2026-11-19 03:51:47.40153+00	2026-10-20 04:01:41.99397+00	2026-10-20 03:51:46.778691+00	\N	\N
9c223cab-7a72-424a-ad58-d1b3c7482d87	44444444-4444-4444-4444-444444444446	3a806d76b7bbf25eba09a578aee4d6720c90fdb90ee9708c15761b3e6815d8e6	2026-11-19 04:04:59.209609+00	\N	2026-10-20 04:04:58.614475+00	\N	\N
5cd213cf-ab0b-48bd-9c84-d97654164bb5	44444444-4444-4444-4444-444444444446	eef0a30a158c4a1b29fed7ac40550f934ed21354ca73e6700fcfdc0648dae49e	2026-11-19 04:06:48.818905+00	\N	2026-10-20 04:06:48.229699+00	\N	\N
fd423228-bb6b-4d43-aa74-4388d9843c80	44444444-4444-4444-4444-444444444440	ae010cdebd4a1d0cadaa7af4b96fe42cd53431f7abaf888cb7fb893b06d4fcd3	2026-11-19 04:01:42.799576+00	2026-10-20 05:25:25.186838+00	2026-10-20 04:01:42.203631+00	\N	\N
cd80684d-6ad7-4163-b086-57ee610a665c	44444444-4444-4444-4444-444444444440	9e3fc22cb347719d0b724875d6f6ae7cb966206995fed035e66c25499354dc38	2026-11-18 04:28:07.186946+00	2026-10-20 05:25:25.567283+00	2026-10-19 04:28:06.917153+00	\N	\N
23c25b71-da1a-463e-8d5d-92fb918cb5a5	44444444-4444-4444-4444-444444444440	d9d7026a390d7b275c724d69b0319fb102d6a5e526555e571373d869142f763f	2026-11-18 05:03:32.256357+00	2026-10-20 05:25:25.567283+00	2026-10-19 05:03:31.723086+00	\N	\N
33288784-ae3e-40e7-9b53-09d2cfcd0fec	44444444-4444-4444-4444-444444444440	a26b5e7dc1fd94634b96e041b19a00ab6ecdf3bf9038f3d85e0458b65d2d05eb	2026-11-18 06:24:46.59282+00	2026-10-20 05:25:25.567283+00	2026-10-19 06:24:46.279327+00	\N	\N
d8698ab4-fc7f-4a0b-b2f2-f1d025a0190b	44444444-4444-4444-4444-444444444440	646ed56e72edbfeacbeac52b245dd6432d293bd0650bfac3569269ef4841894b	2026-11-18 07:19:26.101508+00	2026-10-20 05:25:25.567283+00	2026-10-19 07:19:25.426878+00	\N	\N
b2ef7830-4702-4867-99e0-7e7ab5bf8998	44444444-4444-4444-4444-444444444440	c16fa60bd6115c8392854e629c84e296ee6cbb6c6acb8760c8e9d78261d6701f	2026-11-18 07:59:37.227004+00	2026-10-20 05:25:25.567283+00	2026-10-19 07:59:36.66357+00	\N	\N
0809051c-96a2-40f0-b8d9-0dcbb8df49bc	44444444-4444-4444-4444-444444444440	7601a3844b8cbb929492c25bcaa4d295f6ca9056b9b71f1fcd1f6c2c296da45d	2026-11-18 08:01:03.777458+00	2026-10-20 05:25:25.567283+00	2026-10-19 08:01:03.228341+00	\N	\N
c9397979-ac2a-4973-b302-e824a3343f16	44444444-4444-4444-4444-444444444440	30a774cd1918ab718d101be183f1c965589e2150a744270c82d4b5c41d19e90e	2026-11-18 08:04:52.986753+00	2026-10-20 05:25:25.567283+00	2026-10-19 08:04:52.436254+00	\N	\N
66624e0b-f8f6-41db-8d99-73b22f386689	44444444-4444-4444-4444-444444444440	903d716fee9b0d5ea0f3ab79135ecbc6e74acf19873e9cd8bfcd95d9a2bfd8eb	2026-11-18 08:42:39.007524+00	2026-10-20 05:25:25.567283+00	2026-10-19 08:42:38.561433+00	\N	\N
03e8f71e-4655-461c-8eca-25103c54669c	44444444-4444-4444-4444-444444444440	92c3acdd94b12b14e0d5ae0fa2c5ec9ff68a23ab8b9aae9e5d698af08f52c99d	2026-11-18 08:54:49.783578+00	2026-10-20 05:25:25.567283+00	2026-10-19 08:54:49.373633+00	\N	\N
b9448cfe-49b1-4085-ab91-cdacde8804af	44444444-4444-4444-4444-444444444440	207959fce5007097270df67212801ac4876884e88e6494f61fd9f6aa7af67b77	2026-11-18 08:54:59.567641+00	2026-10-20 05:25:25.567283+00	2026-10-19 08:54:59.157401+00	\N	\N
a59c36f3-e213-4481-9f43-f4be0de433da	44444444-4444-4444-4444-444444444440	79c06d03034f14bdaf029aab960178dd13b4ec1bf93e265abdd005aa2585de17	2026-11-18 08:57:35.513804+00	2026-10-20 05:25:25.567283+00	2026-10-19 08:57:35.107407+00	\N	\N
17b7f343-24f7-4308-b899-4d63999ddf9c	44444444-4444-4444-4444-444444444440	b8692cb13bd153c74b8b639ac2a08179d2431f94f78be84cf2cf4e53379f8c68	2026-11-18 08:57:40.501071+00	2026-10-20 05:25:25.567283+00	2026-10-19 08:57:40.098611+00	\N	\N
2388af7b-ab24-4ace-8112-1f363bef267e	44444444-4444-4444-4444-444444444440	aceecbaac79200b2abb5377b2fcc82d78eaef4a2b677cdb5b8845e9afeabad28	2026-11-18 09:04:27.917103+00	2026-10-20 05:25:25.567283+00	2026-10-19 09:04:27.532378+00	\N	\N
223e41a0-3609-4386-a1e4-046b799be207	44444444-4444-4444-4444-444444444440	db6128ebfc3898697b21a2f41f8f67cb62f115913cd79b98fb10863b55b6bb3d	2026-11-18 09:31:13.240951+00	2026-10-20 05:25:25.567283+00	2026-10-19 09:31:12.923634+00	\N	\N
783c945a-d051-4148-a172-9c2c663da5ba	44444444-4444-4444-4444-444444444440	89d166ad839b2e72e0519abf4905cb94e49f196a772324f441e3a0f452d5f92e	2026-11-19 04:01:42.790598+00	2026-10-20 05:25:25.567283+00	2026-10-20 04:01:42.188741+00	\N	\N
4ae3ce92-2cd6-42a4-bdd0-6305974002a7	44444444-4444-4444-4444-444444444440	0d66a8fa3f541f1bb77885f115683280daa948aaf73b489cf9faf170f0e17da3	2026-11-19 05:25:26.212446+00	2026-10-20 05:25:25.567283+00	2026-10-20 05:25:25.405381+00	\N	\N
dcbf6553-22e3-4bf9-862a-923e17752866	44444444-4444-4444-4444-444444444444	1e75c026dce9109c090bffa1c404f205182ec1a6db6754329396d9595c680a1b	2026-11-19 05:25:29.061814+00	2026-10-20 05:25:43.671613+00	2026-10-20 05:25:28.255126+00	\N	\N
25a93eef-0168-48be-8448-038b57ccea0b	44444444-4444-4444-4444-444444444445	65783d4e7975b5fae60d11d18a187758f6a586b8cdde0266a4dbaa11f7ea1188	2026-11-19 05:25:46.236416+00	2026-10-20 05:26:02.426506+00	2026-10-20 05:25:45.428452+00	\N	\N
31f718b3-0cac-44db-8ec3-b5bde45cea8d	44444444-4444-4444-4444-444444444445	f2f924648354c4141375081b94b7b493768ee204776005e1611141870abc9b1a	2026-11-19 05:26:03.414931+00	\N	2026-10-20 05:26:02.607841+00	\N	\N
bace7ec3-c40d-4ef3-b785-910219cb62df	44444444-4444-4444-4444-444444444445	16da1d797c948a01faee3a950dd84b81456e3e2e1926aac9a8b8fd8a0137fd0c	2026-11-19 05:26:03.423401+00	2026-10-20 06:34:08.108729+00	2026-10-20 05:26:02.618049+00	\N	\N
0c6acefa-084e-4b9e-8d5d-0530c5dd91a7	44444444-4444-4444-4444-444444444445	7102429adc45211b0f185b455fce26fd02f2d1495f5700ae9b16c20043d0459f	2026-11-19 06:34:09.116576+00	\N	2026-10-20 06:34:08.329997+00	\N	\N
185ecb8b-7b0d-480f-8579-3b8df6b58de3	44444444-4444-4444-4444-444444444445	c86038c87d80b1b429b4c619d3deecdbf02efbb247f861ad91be0c7111561f9e	2026-11-19 06:34:09.135294+00	2026-10-20 06:34:10.488859+00	2026-10-20 06:34:08.340163+00	\N	\N
9bfd3f0b-d644-4098-a3c0-d6dc7949e249	44444444-4444-4444-4444-444444444445	5f579a1f5645a4f553209099edd4aeba879eb05980ebc101a89ae0056f7e128c	2026-11-19 06:34:14.700782+00	2026-10-20 06:35:49.534215+00	2026-10-20 06:34:13.90685+00	\N	\N
f2f1e52a-82dc-43ba-bb4a-90ed8ac2a589	44444444-4444-4444-4444-444444444445	a4a92776eedce1b1ee0436386f3f5f6c66441bfb5d52fb50337960e23e888534	2026-11-19 06:35:50.518127+00	\N	2026-10-20 06:35:49.735894+00	\N	\N
a146a594-a07b-4ff9-9f80-6a40de0891bb	44444444-4444-4444-4444-444444444445	47b961118af50272e0b6451e49b78962c293d83fdeb024e1ca818630b1726705	2026-11-19 06:35:50.531142+00	2026-10-20 06:37:17.224183+00	2026-10-20 06:35:49.741042+00	\N	\N
b3c338b1-1c64-42ff-8174-581e68267b81	44444444-4444-4444-4444-444444444445	5ef1d60548f50db2d81efcf9848247dc5dd506ff925edaebea61776f5e0b9582	2026-11-19 06:37:18.192409+00	\N	2026-10-20 06:37:17.403645+00	\N	\N
71b1fd80-72e9-4192-a832-a880e48142dd	44444444-4444-4444-4444-444444444445	f3b05dbda7a94b39e6a879702051e21102f5a77ead4caabf4169d23bc7037512	2026-11-19 06:37:18.298997+00	2026-10-20 06:38:15.650779+00	2026-10-20 06:37:17.519968+00	\N	\N
5a95c23d-1a46-42af-a512-3051cf749545	44444444-4444-4444-4444-444444444445	d265bb6635692a0403286c10b6542ec02187286b91f4518c4dd38b6628bc64bc	2026-11-19 06:38:16.641639+00	\N	2026-10-20 06:38:15.857645+00	\N	\N
0b0e80b8-8dff-45fc-819f-3e85f5b9e816	44444444-4444-4444-4444-444444444445	ce04fe5f351cee99b4506ba49f2ad99a61d3e91ddc3f4579295f20416464b77f	2026-11-19 06:38:16.68018+00	2026-10-20 07:15:18.779344+00	2026-10-20 06:38:15.904136+00	\N	\N
17d0f144-b9b7-4bf7-ae2c-1dd373ea054d	44444444-4444-4444-4444-444444444445	d3b8cd75fbaa220fa2a7aa31420ae391bd921f96382e809ce47212e33657a9e5	2026-11-19 07:15:20.17384+00	\N	2026-10-20 07:15:18.970496+00	\N	\N
55a619e2-c0c1-4c28-a920-ea5dcc0f923f	44444444-4444-4444-4444-444444444445	b656ef0738186bbb802cacac751e9a335d2a9935910a6be38d7634b353405971	2026-11-19 07:15:20.363009+00	2026-10-20 08:35:00.781114+00	2026-10-20 07:15:19.169678+00	\N	\N
9afb6555-46b7-43b6-83f4-afc6510d7d25	44444444-4444-4444-4444-444444444445	3a0969b4e677b78eed00fb0ca0027372074944637bce9ceefb2c70851562d24c	2026-11-19 08:35:01.98891+00	\N	2026-10-20 08:35:01.006363+00	\N	\N
a85a7511-0036-45d1-870a-49fb57af4db2	44444444-4444-4444-4444-444444444445	373a3b493a268972ffa19818abceb83c2ae5bdf0496ac7275b1a8627f1214ad5	2026-11-19 08:35:02.06153+00	2026-10-20 09:05:42.179043+00	2026-10-20 08:35:01.080698+00	\N	\N
1437e349-bd78-46f0-b29f-3d63bff40fa2	11111111-1111-1111-1111-111111111111	b590decc588a13ed237166503473d3c8ab2dd7e0f1ad176241cbb396f381d058	2026-11-19 02:41:49.37301+00	2026-10-20 09:19:58.018019+00	2026-10-20 02:41:48.566739+00	\N	\N
26f5efd9-b343-4abb-acf0-5ea3a5989315	44444444-4444-4444-4444-444444444445	f943f1d8daef63ceb720f0d56047e1efa651a42a223e1a5ead1cba66854b3f3d	2026-11-19 09:05:43.257278+00	\N	2026-10-20 09:05:42.358958+00	\N	\N
c28b959f-f518-4415-947f-5fb93cac90d9	44444444-4444-4444-4444-444444444445	9c372a7372b1517b2e980eee33bdd6c1d7ebf9c1de575b26058d7ac9a1b6a570	2026-11-19 09:05:43.488431+00	2026-10-20 09:05:44.000735+00	2026-10-20 09:05:42.604079+00	\N	\N
e5aa7018-52f7-4783-a7b6-cb977b516652	44444444-4444-4444-4444-444444444440	c2ab6e9b84d6656ccc12c02e5d0f95c4f849b7f1d780bdb351ff65818d995920	2026-11-19 09:05:54.4539+00	2026-10-20 09:06:47.658755+00	2026-10-20 09:05:53.556058+00	\N	\N
a09aa1e9-7108-4089-accb-97dc9c62676b	11111111-1111-1111-1111-111111111111	5a9fcb1b4b1592aa3eb83e8df6a839fe62e5dcef44f910b1040eebe3b1ffd3af	2026-11-19 09:06:51.021005+00	2026-10-20 09:19:57.675833+00	2026-10-20 09:06:50.127616+00	\N	\N
7b7fc2c7-8c0b-4992-802a-bcbbaf6cb905	11111111-1111-1111-1111-111111111111	b6cee02f58cf801796bb529d1c68b85da6886b1b86728d324dc1544d4788486e	2026-11-19 02:53:00.536734+00	2026-10-20 09:19:58.018019+00	2026-10-20 02:52:59.747473+00	\N	\N
e2f86cf6-00b7-4a51-a815-c1164ce25b9b	11111111-1111-1111-1111-111111111111	cc0cc0f78c9851098ab8a1441b3729afe34c2acdac3d1eb7abdd2cbb454cf500	2026-11-19 02:57:18.930744+00	2026-10-20 09:19:58.018019+00	2026-10-20 02:57:18.153085+00	\N	\N
4824b2ac-18c1-47ee-ad8d-b23a6123baf0	11111111-1111-1111-1111-111111111111	b4232a6388851ef5c8ba6741d817cb6fe75cf364f4099fa405b386ebbac568ad	2026-11-19 02:59:53.611446+00	2026-10-20 09:19:58.018019+00	2026-10-20 02:59:52.840941+00	\N	\N
78fe38c4-1109-40d2-8db1-b88f65fd7c0c	11111111-1111-1111-1111-111111111111	1007e58cc691aa3c5b59ed82ae9709411303b8a708d5e79351739a433d25062f	2026-11-19 03:03:11.431111+00	2026-10-20 09:19:58.018019+00	2026-10-20 03:03:10.66957+00	\N	\N
d8525039-2b6e-447c-958a-7ce12dba7fc8	11111111-1111-1111-1111-111111111111	6f08af544af7c462d0cdf77232f618a78ac10093e24b7341105d24441dea3cf2	2026-11-19 09:06:50.256727+00	2026-10-20 09:19:58.018019+00	2026-10-20 09:06:49.374782+00	\N	\N
ed873097-34dd-4eba-8fb7-592b8f4014a7	11111111-1111-1111-1111-111111111111	d27bdf8323898f1910ec170d72779ba1b63df0990febc8643b85d9f8b59c9f7a	2026-11-19 09:19:58.748065+00	2026-10-20 09:19:58.018019+00	2026-10-20 09:19:57.902241+00	\N	\N
6c5df2b1-f062-4829-93f0-368b7c85dedd	11111111-1111-1111-1111-111111111111	79aea1f89915738939f9fadf083af0fab8a777cab3bff846c991034f57eb8f12	2026-11-19 09:20:05.124855+00	2026-10-21 02:14:02.216371+00	2026-10-20 09:20:04.279562+00	\N	\N
6ab44689-6935-46c2-aa8b-0318e6648152	11111111-1111-1111-1111-111111111111	d6016453a0023c0506d3ce9c40ff1d1e6ab6441a361375af81805742fa5eb589	2026-11-20 02:14:02.217889+00	\N	2026-10-21 02:14:02.411884+00	\N	\N
7944a424-d156-43b3-a033-d6450e117d84	11111111-1111-1111-1111-111111111111	c92231b3a8a52499d0dc7919c7c2a8f7c9ae814c634d010ccbc4a13e01811827	2026-11-20 02:14:02.217389+00	2026-10-21 02:14:43.799615+00	2026-10-21 02:14:02.40976+00	\N	\N
76a4d9bf-f2ad-40db-865e-e69a86123abe	44444444-4444-4444-4444-444444444445	f2695094ddd7b015e8d1690ca6b655547c4765e7ed52ea6192217e10c6c5b480	2026-11-20 02:14:45.343127+00	2026-10-21 02:29:48.733734+00	2026-10-21 02:14:45.546306+00	\N	\N
2e782569-665c-4bb5-af5e-572d683a0e0f	44444444-4444-4444-4444-444444444445	d739e273c6601576c9d4852466d61bedadfc3842b53bb82a99a5e213b6c2239a	2026-11-20 02:29:48.704879+00	2026-10-21 02:50:13.575419+00	2026-10-21 02:29:48.939935+00	\N	\N
e73f3e2f-67dc-4997-b5dd-7324c17b98bb	44444444-4444-4444-4444-444444444445	da8d9c27ecb8ecb35e1ec547fc5dfc805e008530b0c744ff1f701ea80c4dd8b2	2026-11-20 02:50:13.49543+00	\N	2026-10-21 02:50:13.784935+00	\N	\N
bb76624f-a6e8-47a2-bbc9-3b7e9f358f4f	44444444-4444-4444-4444-444444444445	a7fc38749f8a1ccdae0c438d8849f1e9cfde46beb7ab08f2a310d0da1c8a25b4	2026-11-20 02:50:13.503819+00	2026-10-21 03:05:20.51558+00	2026-10-21 02:50:13.793598+00	\N	\N
683ecb03-696f-450c-9eee-a799dce97adf	44444444-4444-4444-4444-444444444445	28737f8c833d64501209535419d1e26ab66c76f94f1fac9c44c5fb6722258162	2026-11-20 03:05:20.368708+00	2026-10-21 03:05:25.300742+00	2026-10-21 03:05:20.70059+00	\N	\N
3f563492-e3a6-49f5-9970-0b2f35795a8a	44444444-4444-4444-4444-444444444445	adda5c5253c1810de580d3f102f71710abc4b7313f3857f3b67b7cf176f279c4	2026-11-20 03:05:25.149592+00	\N	2026-10-21 03:05:25.481847+00	\N	\N
e9e2d976-f93d-4f6a-aad8-ee8530c5fae2	44444444-4444-4444-4444-444444444445	575489ec3ca98743828c8a5962ccf47bb58102c744fad3d500499a5ee4f14e45	2026-11-20 03:05:25.254952+00	2026-10-21 03:08:36.260793+00	2026-10-21 03:05:25.596011+00	\N	\N
0ccbd92d-acb2-474c-8eb2-25b7c7c6340c	44444444-4444-4444-4444-444444444445	782babad93d0cf16dffd08707cbc03d92c666d7989de2e1abbf03efb9edaa19f	2026-11-20 03:08:36.10452+00	\N	2026-10-21 03:08:36.444634+00	\N	\N
22964f50-68c3-495e-93b1-d9d55e223832	44444444-4444-4444-4444-444444444445	19ee739c5cffda7cf4be839ec0b8a4724aa6d67411670e30e71db6357e0b8721	2026-11-20 03:08:36.105518+00	2026-10-21 03:12:04.115783+00	2026-10-21 03:08:36.445483+00	\N	\N
2527e85e-0956-422d-a789-6c108607751d	44444444-4444-4444-4444-444444444445	606184b7285a5dfaad17b7d1e6c9e0ee66e0ca77d8a1c911484951c72e2436ca	2026-11-20 03:12:03.947181+00	\N	2026-10-21 03:12:04.298333+00	\N	\N
50555c4f-34b3-4562-af4a-4d73a8ee3447	44444444-4444-4444-4444-444444444445	f5440ebebbe9ab0c409e894b7b435372c2ed7e4195cb47683949b659d2566bc0	2026-11-20 03:12:04.047598+00	2026-10-21 03:12:46.596498+00	2026-10-21 03:12:04.407302+00	\N	\N
0a5289d6-2bd8-42e8-8a87-9db963bae220	44444444-4444-4444-4444-444444444445	786630a5c72f41c3708961e17a7d5a625008f69f114b8899f8a8365430ddacf5	2026-11-20 03:12:46.43425+00	\N	2026-10-21 03:12:46.787646+00	\N	\N
8481557e-2447-4be5-bc43-160ce316321c	44444444-4444-4444-4444-444444444445	33883d748fe90d5633ccf79eab33c45c31577dbd1c0d38110dd22ec223e4b813	2026-11-20 03:12:46.609+00	2026-10-21 03:29:07.456145+00	2026-10-21 03:12:46.970505+00	\N	\N
81cd8a7f-5e36-4845-b94b-3c1f3e47d63a	44444444-4444-4444-4444-444444444445	31dc23f0390b5a18ea808e743d112e8e013583d07a4465c77e08e30dcc530853	2026-11-20 03:29:07.24104+00	2026-10-21 03:41:25.295114+00	2026-10-21 03:29:07.641785+00	\N	\N
63d5a98f-1989-4de1-8cb5-7f6038fbb158	44444444-4444-4444-4444-444444444445	41e3b9e599eab0ca3e4c44c6b486f1dca1740dd88702df33905e90ef23c18ba5	2026-11-20 03:41:25.051679+00	\N	2026-10-21 03:41:25.487289+00	\N	\N
db47ae33-fde4-40d4-8f9e-338079bec99f	44444444-4444-4444-4444-444444444445	d223cdce8a12f43923c2320ac3139ee332ff9d672e2d179d1b0153f089a966ec	2026-11-20 03:41:25.084414+00	\N	2026-10-21 03:41:25.518577+00	\N	\N
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (id, code, name, description, created_at) FROM stdin;
1	ADMIN	Administrator	Manages students, teachers, courses, classes, schedules, and completion approvals.	2026-08-19 02:16:56.479806+00
2	TEACHER	Teacher	Views assigned classes, records attendance, and assesses practical competencies.	2026-08-19 02:16:56.479806+00
3	STUDENT	Student	Views personal schedules, attendance, assessments, and learning progress.	2026-08-19 02:16:56.479806+00
4	SALE	Sale Staff	Manages leads, records interactions, converts leads to students, and creates orders.	2026-10-07 03:54:30.241967+00
5	SALE_ADMIN	Sale Administrator	Manages admissions, assigns leads, approves orders, and views sales reports.	2026-10-07 04:30:12.274425+00
6	ACADEMIC_ADMIN	Academic Administrator	Quản lý đào tạo: học viên, giảng viên, khóa học, lớp học, lịch học, điểm danh, thi và tốt nghiệp.	2026-10-09 04:59:41.394368+00
\.


--
-- Data for Name: student_assessments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.student_assessments (id, class_id, course_id, student_id, assessed_by, session_id, assessment_no, status, overall_comment, submitted_at, locked_at, created_at, updated_at, evidence_url) FROM stdin;
\.


--
-- Data for Name: student_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.student_profiles (id, user_id, student_code, full_name, phone, date_of_birth, status, enrolled_at, created_at, updated_at, gender, address, emergency_contact_name, emergency_contact_phone, avatar_url) FROM stdin;
3fe6a64b-798c-4b83-a752-28ebfc57c546	33333333-3333-3333-3333-333333333333	HV00000001	Demo Student	\N	\N	active	2026-08-19	2026-08-19 02:16:56.479806+00	2026-08-19 02:16:56.479806+00	\N	\N	\N	\N	\N
fc4b6416-ee74-492e-a13f-1897064a779a	33333333-3333-3333-3333-333333333334	HV00000014	Nguyễn Thành Nam	0934112233	\N	active	2026-07-05	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00	\N	\N	\N	\N	\N
98a56a05-dbf9-477b-a3d4-7d200140f1db	33333333-3333-3333-3333-333333333335	HV00000015	Lê Hoàng Long	0934445566	\N	active	2026-07-05	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00	\N	\N	\N	\N	\N
2cff9c13-87ce-4522-bf3d-618bd6069857	33333333-3333-3333-3333-333333333336	HV00000016	Phạm Minh Tuấn	0934778899	\N	active	2026-07-05	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00	\N	\N	\N	\N	\N
781cf431-6bb1-4209-8708-069177eb0325	33333333-3333-3333-3333-333333333337	HV00000017	Trần Quang Huy	0934123789	\N	active	2026-07-05	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00	\N	\N	\N	\N	\N
5fe4edef-3498-46fe-a735-2d3fd7dad19e	27462da8-07a1-41dd-bb04-5fa5b0ea6dcd	HV00000018	Lê Hoàng Long	0903332211	2001-08-09	active	2026-10-07	2026-10-07 08:42:49.566173+00	2026-10-07 08:42:49.566173+00	male	Thị xã Sơn Tây, Hà Nội	\N	\N	\N
eb8b759a-d60d-4efa-a850-270d1e18ddc9	ef653319-6322-4eca-b2ed-9dad92f95966	HV00000019	Nguyễn Thị Hồng	0912345999	2001-10-20	active	2026-10-21	2026-10-21 03:42:03.751931+00	2026-10-21 03:42:03.751931+00	female	TP. Hồ Chí Minh	\N	\N	\N
\.


--
-- Data for Name: student_status_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.student_status_history (id, student_id, from_status, to_status, reason, changed_by, changed_at) FROM stdin;
9df5856b-7219-4d4e-b7b4-c31236f858b9	3fe6a64b-798c-4b83-a752-28ebfc57c546	\N	active	Khởi tạo dữ liệu demo	\N	2026-08-19 02:16:56.479806+00
ee4d80cc-0455-45fb-a287-87736ca826a6	5fe4edef-3498-46fe-a735-2d3fd7dad19e	\N	active	1-Click Chuyển đổi từ Lead CRM	11111111-1111-1111-1111-111111111111	2026-10-07 08:42:49.566173+00
f043fba5-43fa-4930-9ba0-147eebe5d701	eb8b759a-d60d-4efa-a850-270d1e18ddc9	\N	active	1-Click Chuyển đổi từ Lead CRM	44444444-4444-4444-4444-444444444445	2026-10-21 03:42:03.751931+00
\.


--
-- Data for Name: student_test_attempts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.student_test_attempts (id, test_id, course_id, class_id, student_id, attempt_no, score, note, recorded_by, taken_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: student_test_retake_permits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.student_test_retake_permits (id, test_id, course_id, student_id, target_attempt_no, granted_by, reason, granted_at, created_at) FROM stdin;
\.


--
-- Data for Name: teacher_assignment_periods; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.teacher_assignment_periods (id, assignment_id, started_at, ended_at, created_by, ended_by, start_reason, end_reason, created_at) FROM stdin;
\.


--
-- Data for Name: teacher_assignments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.teacher_assignments (id, class_id, teacher_id, assignment_role, assigned_at, assigned_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: teacher_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.teacher_profiles (id, user_id, teacher_code, full_name, phone, specialization, status, created_at, updated_at, avatar_url) FROM stdin;
69a2340b-28c5-4d9a-a685-818784c152e0	22222222-2222-2222-2222-222222222222	TCH-DEMO-001	Demo Teacher	\N	Automotive Electrical Systems	active	2026-08-19 02:16:56.479806+00	2026-08-19 02:16:56.479806+00	\N
87456d21-32f4-446e-bbeb-d8d908e0a748	22222222-2222-2222-2222-222222222223	TCH-002	ThS. Nguyễn Văn Hùng	0912345678	Chuyên gia Động cơ Phun dầu & SCR	active	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00	\N
461d15ec-ccb3-44ad-b46c-f3adefe576c5	22222222-2222-2222-2222-222222222224	TCH-003	Kỹ sư Trần Đức Thắng	0987654321	Chuyên gia Xe Điện EV & Mạng CAN	active	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00	\N
\.


--
-- Data for Name: test_attempt_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.test_attempt_history (id, attempt_id, old_score, new_score, old_note, new_note, reason, changed_by, changed_at) FROM stdin;
\.


--
-- Data for Name: training_locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.training_locations (id, code, name, location_type, capacity, is_active, created_at, updated_at) FROM stdin;
10000000-0000-0000-0000-000000000001	LT-101	Phòng Lý thuyết Công nghệ Ô tô 101	classroom	35	t	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
10000000-0000-0000-0000-000000000002	LT-102	Phòng Mô phỏng & Chẩn đoán Điện tử 102	classroom	25	t	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
10000000-0000-0000-0000-000000000003	XH-01	Xưởng Thực hành Điện & Điện tử Ô tô XH1	workshop	20	t	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
10000000-0000-0000-0000-000000000004	XH-02	Xưởng Thực hành Động cơ & Khung gầm XH2	workshop	20	t	2026-08-19 07:42:12.719914+00	2026-08-19 07:42:12.719914+00
99999999-9999-9999-9999-999999999999	E2E-ROOM	Phòng kiểm thử E2E	classroom	20	t	2026-10-09 07:36:14.40649+00	2026-10-09 07:36:14.40649+00
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (user_id, role_id, assigned_at, assigned_by) FROM stdin;
11111111-1111-1111-1111-111111111111	1	2026-08-19 02:16:56.479806+00	\N
22222222-2222-2222-2222-222222222222	2	2026-08-19 02:16:56.479806+00	\N
33333333-3333-3333-3333-333333333333	3	2026-08-19 02:16:56.479806+00	\N
22222222-2222-2222-2222-222222222223	2	2026-08-19 07:42:12.719914+00	\N
22222222-2222-2222-2222-222222222224	2	2026-08-19 07:42:12.719914+00	\N
33333333-3333-3333-3333-333333333334	3	2026-08-19 07:42:12.719914+00	\N
33333333-3333-3333-3333-333333333335	3	2026-08-19 07:42:12.719914+00	\N
33333333-3333-3333-3333-333333333336	3	2026-08-19 07:42:12.719914+00	\N
33333333-3333-3333-3333-333333333337	3	2026-08-19 07:42:12.719914+00	\N
44444444-4444-4444-4444-444444444444	4	2026-10-07 03:54:52.553225+00	\N
44444444-4444-4444-4444-444444444445	4	2026-10-07 04:20:08.966959+00	\N
44444444-4444-4444-4444-444444444446	4	2026-10-07 04:20:08.966959+00	\N
44444444-4444-4444-4444-444444444440	5	2026-10-07 04:30:28.186172+00	\N
27462da8-07a1-41dd-bb04-5fa5b0ea6dcd	3	2026-10-07 08:42:49.566173+00	11111111-1111-1111-1111-111111111111
7a2ef762-dfb2-4285-9757-ce0d1d2d629a	1	2026-10-09 08:55:45.076766+00	11111111-1111-1111-1111-111111111111
f1ac1788-2372-478b-897b-6ee076064fcb	6	2026-10-10 02:19:43.764852+00	7a2ef762-dfb2-4285-9757-ce0d1d2d629a
ef653319-6322-4eca-b2ed-9dad92f95966	3	2026-10-21 03:42:03.751931+00	44444444-4444-4444-4444-444444444445
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, status, must_change_password, last_login_at, created_at, updated_at, full_name, phone, is_accepting_leads, lead_assignment_order) FROM stdin;
11111111-1111-1111-1111-111111111111	admin@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	2026-10-20 09:20:04.615037+00	2026-08-19 02:16:56.479806+00	2026-10-20 09:20:04.615037+00	\N	\N	t	0
7a2ef762-dfb2-4285-9757-ce0d1d2d629a	trungnm@newcitygroupsuleco.com.vn	$2a$10$feC5YfMnZK560aY9J.jEyOl5vBf1fPy1TWwboVg5m0rTaCKm/Hb7K	active	f	2026-10-10 02:18:31.283413+00	2026-10-09 08:55:45.076766+00	2026-10-10 02:18:31.283413+00	Nguyễn Minh Trung	\N	t	0
44444444-4444-4444-4444-444444444445	sale2@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	2026-10-21 02:14:45.859971+00	2026-10-07 04:20:08.966959+00	2026-10-21 02:14:45.859971+00	\N	\N	t	2
ef653319-6322-4eca-b2ed-9dad92f95966	mainguyen@example.com	$2a$10$aLONjjuiQG3YbDVxF8cZfuaevktrJGOOoiaXh5xzrV80p/hlG1VKG	active	f	\N	2026-10-21 03:42:03.751931+00	2026-10-21 03:42:03.751931+00	\N	\N	t	0
22222222-2222-2222-2222-222222222222	teacher@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	2026-10-19 07:55:16.852359+00	2026-08-19 02:16:56.479806+00	2026-10-19 07:55:16.852359+00	Demo Teacher	\N	t	0
27462da8-07a1-41dd-bb04-5fa5b0ea6dcd	long.lh@gmail.com	$2a$10$62LwP6.l5bG08/4dV09wqe7aWkzRqgt1FSev30ECg158GZlQSF9KO	active	f	\N	2026-10-07 08:42:49.566173+00	2026-10-10 02:33:27.72985+00	Lê Hoàng Long	0903332211	t	0
f1ac1788-2372-478b-897b-6ee076064fcb	newcitygroupsulecoit@gmail.com	$2a$10$jxliLb2od5PC2ijkcHj/GOqHJ0CdIaeEVRlQvU4n6xi87qJ3pWC.e	active	f	2026-10-10 02:41:45.836742+00	2026-10-10 02:19:43.764852+00	2026-10-10 02:41:45.836742+00	IT mail	\N	t	0
44444444-4444-4444-4444-444444444446	sale3@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	2026-10-20 04:06:48.49925+00	2026-10-07 04:20:08.966959+00	2026-10-20 04:06:48.49925+00	\N	\N	t	3
44444444-4444-4444-4444-444444444444	sale@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	2026-10-20 05:25:28.560929+00	2026-10-07 03:54:52.553225+00	2026-10-20 05:25:28.560929+00	\N	\N	t	1
44444444-4444-4444-4444-444444444440	sale_admin@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	2026-10-20 09:05:53.82518+00	2026-10-07 04:30:28.186172+00	2026-10-20 09:05:53.82518+00	\N	\N	t	0
33333333-3333-3333-3333-333333333334	nam.nguyen@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	\N	2026-08-19 07:42:12.719914+00	2026-10-09 04:59:41.394368+00	Nguyễn Thành Nam	0934112233	t	0
33333333-3333-3333-3333-333333333335	long.le@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	\N	2026-08-19 07:42:12.719914+00	2026-10-09 04:59:41.394368+00	Lê Hoàng Long	0934445566	t	0
33333333-3333-3333-3333-333333333336	tuan.pham@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	\N	2026-08-19 07:42:12.719914+00	2026-10-09 04:59:41.394368+00	Phạm Minh Tuấn	0934778899	t	0
33333333-3333-3333-3333-333333333337	huy.tran@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	\N	2026-08-19 07:42:12.719914+00	2026-10-09 04:59:41.394368+00	Trần Quang Huy	0934123789	t	0
22222222-2222-2222-2222-222222222223	hung.nguyen@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	\N	2026-08-19 07:42:12.719914+00	2026-10-09 04:59:41.394368+00	ThS. Nguyễn Văn Hùng	0912345678	t	0
22222222-2222-2222-2222-222222222224	thang.tran@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	\N	2026-08-19 07:42:12.719914+00	2026-10-09 04:59:41.394368+00	Kỹ sư Trần Đức Thắng	0987654321	t	0
33333333-3333-3333-3333-333333333333	student@nsa.local	$2a$10$GsxiaGCj4KByEhya9W2DKuBXIXe2rFCEPSqwArzcHJkRes85Q2AQe	active	f	2026-10-09 09:13:19.607124+00	2026-08-19 02:16:56.479806+00	2026-10-09 09:13:19.607124+00	Demo Student	\N	t	0
\.


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 174, true);


--
-- Name: certificate_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.certificate_number_seq', 1, false);


--
-- Name: goose_db_version_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.goose_db_version_id_seq', 19, true);


--
-- Name: order_code_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_code_seq', 15, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_id_seq', 6, true);


--
-- Name: student_code_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.student_code_seq', 19, true);


--
-- Name: assessment_items assessment_items_assessment_id_competency_criterion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_items
    ADD CONSTRAINT assessment_items_assessment_id_competency_criterion_id_key UNIQUE (assessment_id, competency_criterion_id);


--
-- Name: assessment_items assessment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_items
    ADD CONSTRAINT assessment_items_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_class_session_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_class_session_id_student_id_key UNIQUE (class_session_id, student_id);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: certificates certificates_certificate_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_certificate_number_key UNIQUE (certificate_number);


--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);


--
-- Name: certificates certificates_verification_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_verification_code_key UNIQUE (verification_code);


--
-- Name: class_enrollment_periods class_enrollment_periods_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollment_periods
    ADD CONSTRAINT class_enrollment_periods_no_overlap EXCLUDE USING gist (enrollment_id WITH =, tstzrange(started_at, COALESCE(ended_at, 'infinity'::timestamp with time zone), '[)'::text) WITH &&);


--
-- Name: class_enrollment_periods class_enrollment_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollment_periods
    ADD CONSTRAINT class_enrollment_periods_pkey PRIMARY KEY (id);


--
-- Name: class_enrollments class_enrollments_class_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollments
    ADD CONSTRAINT class_enrollments_class_id_student_id_key UNIQUE (class_id, student_id);


--
-- Name: class_enrollments class_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollments
    ADD CONSTRAINT class_enrollments_pkey PRIMARY KEY (id);


--
-- Name: class_operation_history class_operation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_operation_history
    ADD CONSTRAINT class_operation_history_pkey PRIMARY KEY (id);


--
-- Name: class_sessions class_sessions_id_class_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_id_class_id_course_id_key UNIQUE (id, class_id, course_id);


--
-- Name: class_sessions class_sessions_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_id_class_id_key UNIQUE (id, class_id);


--
-- Name: class_sessions class_sessions_no_class_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_no_class_overlap EXCLUDE USING gist (class_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE ((status <> 'cancelled'::public.session_status));


--
-- Name: class_sessions class_sessions_no_location_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_no_location_overlap EXCLUDE USING gist (location_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE (((status <> 'cancelled'::public.session_status) AND (location_id IS NOT NULL)));


--
-- Name: class_sessions class_sessions_no_teacher_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_no_teacher_overlap EXCLUDE USING gist (teacher_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE (((status <> 'cancelled'::public.session_status) AND (teacher_id IS NOT NULL)));


--
-- Name: class_sessions class_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_pkey PRIMARY KEY (id);


--
-- Name: classes classes_class_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_class_code_key UNIQUE (class_code);


--
-- Name: classes classes_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_id_course_id_key UNIQUE (id, course_id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: competency_criteria competency_criteria_course_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_criteria
    ADD CONSTRAINT competency_criteria_course_id_code_key UNIQUE (course_id, code);


--
-- Name: competency_criteria competency_criteria_course_id_sequence_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_criteria
    ADD CONSTRAINT competency_criteria_course_id_sequence_no_key UNIQUE (course_id, sequence_no);


--
-- Name: competency_criteria competency_criteria_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_criteria
    ADD CONSTRAINT competency_criteria_id_course_id_key UNIQUE (id, course_id);


--
-- Name: competency_criteria competency_criteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_criteria
    ADD CONSTRAINT competency_criteria_pkey PRIMARY KEY (id);


--
-- Name: completion_decision_history completion_decision_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.completion_decision_history
    ADD CONSTRAINT completion_decision_history_pkey PRIMARY KEY (id);


--
-- Name: course_completions course_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_completions
    ADD CONSTRAINT course_completions_pkey PRIMARY KEY (id);


--
-- Name: course_completions course_completions_student_course_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_completions
    ADD CONSTRAINT course_completions_student_course_key UNIQUE (student_id, course_id);


--
-- Name: course_modules course_modules_course_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_modules
    ADD CONSTRAINT course_modules_course_id_code_key UNIQUE (course_id, code);


--
-- Name: course_modules course_modules_course_id_sequence_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_modules
    ADD CONSTRAINT course_modules_course_id_sequence_no_key UNIQUE (course_id, sequence_no);


--
-- Name: course_modules course_modules_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_modules
    ADD CONSTRAINT course_modules_id_course_id_key UNIQUE (id, course_id);


--
-- Name: course_modules course_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_modules
    ADD CONSTRAINT course_modules_pkey PRIMARY KEY (id);


--
-- Name: course_tests course_tests_course_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_tests
    ADD CONSTRAINT course_tests_course_id_code_key UNIQUE (course_id, code);


--
-- Name: course_tests course_tests_course_id_sequence_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_tests
    ADD CONSTRAINT course_tests_course_id_sequence_no_key UNIQUE (course_id, sequence_no);


--
-- Name: course_tests course_tests_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_tests
    ADD CONSTRAINT course_tests_id_course_id_key UNIQUE (id, course_id);


--
-- Name: course_tests course_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_tests
    ADD CONSTRAINT course_tests_pkey PRIMARY KEY (id);


--
-- Name: courses courses_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_code_key UNIQUE (code);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: goose_db_version goose_db_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goose_db_version
    ADD CONSTRAINT goose_db_version_pkey PRIMARY KEY (id);


--
-- Name: lead_interactions lead_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_interactions
    ADD CONSTRAINT lead_interactions_pkey PRIMARY KEY (id);


--
-- Name: lead_pipeline_history lead_pipeline_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_pipeline_history
    ADD CONSTRAINT lead_pipeline_history_pkey PRIMARY KEY (id);


--
-- Name: lead_tasks lead_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tasks
    ADD CONSTRAINT lead_tasks_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_code_key UNIQUE (order_code);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_code_key UNIQUE (code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: student_assessments student_assessments_class_id_student_id_assessment_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_assessments
    ADD CONSTRAINT student_assessments_class_id_student_id_assessment_no_key UNIQUE (class_id, student_id, assessment_no);


--
-- Name: student_assessments student_assessments_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_assessments
    ADD CONSTRAINT student_assessments_id_course_id_key UNIQUE (id, course_id);


--
-- Name: student_assessments student_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_assessments
    ADD CONSTRAINT student_assessments_pkey PRIMARY KEY (id);


--
-- Name: student_profiles student_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_pkey PRIMARY KEY (id);


--
-- Name: student_profiles student_profiles_student_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_student_code_key UNIQUE (student_code);


--
-- Name: student_profiles student_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_user_id_key UNIQUE (user_id);


--
-- Name: student_status_history student_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_status_history
    ADD CONSTRAINT student_status_history_pkey PRIMARY KEY (id);


--
-- Name: student_test_attempts student_test_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_attempts
    ADD CONSTRAINT student_test_attempts_pkey PRIMARY KEY (id);


--
-- Name: student_test_attempts student_test_attempts_test_id_student_id_attempt_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_attempts
    ADD CONSTRAINT student_test_attempts_test_id_student_id_attempt_no_key UNIQUE (test_id, student_id, attempt_no);


--
-- Name: student_test_retake_permits student_test_retake_permits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_retake_permits
    ADD CONSTRAINT student_test_retake_permits_pkey PRIMARY KEY (id);


--
-- Name: student_test_retake_permits student_test_retake_permits_test_id_student_id_target_attem_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_retake_permits
    ADD CONSTRAINT student_test_retake_permits_test_id_student_id_target_attem_key UNIQUE (test_id, student_id, target_attempt_no);


--
-- Name: teacher_assignment_periods teacher_assignment_periods_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignment_periods
    ADD CONSTRAINT teacher_assignment_periods_no_overlap EXCLUDE USING gist (assignment_id WITH =, tstzrange(started_at, COALESCE(ended_at, 'infinity'::timestamp with time zone), '[)'::text) WITH &&);


--
-- Name: teacher_assignment_periods teacher_assignment_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignment_periods
    ADD CONSTRAINT teacher_assignment_periods_pkey PRIMARY KEY (id);


--
-- Name: teacher_assignments teacher_assignments_class_id_teacher_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_class_id_teacher_id_key UNIQUE (class_id, teacher_id);


--
-- Name: teacher_assignments teacher_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_pkey PRIMARY KEY (id);


--
-- Name: teacher_profiles teacher_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_profiles
    ADD CONSTRAINT teacher_profiles_pkey PRIMARY KEY (id);


--
-- Name: teacher_profiles teacher_profiles_teacher_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_profiles
    ADD CONSTRAINT teacher_profiles_teacher_code_key UNIQUE (teacher_code);


--
-- Name: teacher_profiles teacher_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_profiles
    ADD CONSTRAINT teacher_profiles_user_id_key UNIQUE (user_id);


--
-- Name: test_attempt_history test_attempt_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempt_history
    ADD CONSTRAINT test_attempt_history_pkey PRIMARY KEY (id);


--
-- Name: training_locations training_locations_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_locations
    ADD CONSTRAINT training_locations_code_key UNIQUE (code);


--
-- Name: training_locations training_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_locations
    ADD CONSTRAINT training_locations_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: certificates_one_current_per_completion; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX certificates_one_current_per_completion ON public.certificates USING btree (completion_id) WHERE is_current;


--
-- Name: course_tests_one_active_final_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX course_tests_one_active_final_exam ON public.course_tests USING btree (course_id) WHERE ((kind = 'final_exam'::public.course_test_kind) AND is_active);


--
-- Name: idx_assessment_items_criterion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assessment_items_criterion_id ON public.assessment_items USING btree (competency_criterion_id);


--
-- Name: idx_attendance_records_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_records_student_id ON public.attendance_records USING btree (student_id);


--
-- Name: idx_audit_logs_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_actor ON public.audit_logs USING btree (actor_user_id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_new_values_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_new_values_gin ON public.audit_logs USING gin (new_values);


--
-- Name: idx_audit_logs_old_values_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_old_values_gin ON public.audit_logs USING gin (old_values);


--
-- Name: idx_audit_logs_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_request_id ON public.audit_logs USING btree (request_id);


--
-- Name: idx_certificates_verification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_certificates_verification ON public.certificates USING btree (verification_code);


--
-- Name: idx_class_enrollment_periods_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_class_enrollment_periods_one_open ON public.class_enrollment_periods USING btree (enrollment_id) WHERE (ended_at IS NULL);


--
-- Name: idx_class_enrollment_periods_temporal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_enrollment_periods_temporal ON public.class_enrollment_periods USING btree (enrollment_id, started_at, ended_at);


--
-- Name: idx_class_enrollments_student_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_enrollments_student_status ON public.class_enrollments USING btree (student_id, status);


--
-- Name: idx_class_operation_history_class_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_operation_history_class_time ON public.class_operation_history USING btree (class_id, occurred_at DESC, id DESC);


--
-- Name: idx_class_sessions_class_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_sessions_class_start ON public.class_sessions USING btree (class_id, starts_at);


--
-- Name: idx_class_sessions_location_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_sessions_location_start ON public.class_sessions USING btree (location_id, starts_at) WHERE (location_id IS NOT NULL);


--
-- Name: idx_class_sessions_teacher_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_sessions_teacher_start ON public.class_sessions USING btree (teacher_id, starts_at) WHERE (teacher_id IS NOT NULL);


--
-- Name: idx_classes_course_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_course_status ON public.classes USING btree (course_id, status);


--
-- Name: idx_classes_date_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_date_range ON public.classes USING btree (start_date, end_date);


--
-- Name: idx_completion_decision_history_completion_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_completion_decision_history_completion_time ON public.completion_decision_history USING btree (completion_id, decided_at DESC, id DESC);


--
-- Name: idx_course_completions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_completions_status ON public.course_completions USING btree (status);


--
-- Name: idx_courses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_status ON public.courses USING btree (status);


--
-- Name: idx_lead_interactions_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_interactions_lead ON public.lead_interactions USING btree (lead_id, created_at DESC);


--
-- Name: idx_lead_pipeline_history_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_pipeline_history_lead ON public.lead_pipeline_history USING btree (lead_id, changed_at DESC);


--
-- Name: idx_lead_tasks_assignee_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_tasks_assignee_due ON public.lead_tasks USING btree (assigned_to, due_at) WHERE (completed_at IS NULL);


--
-- Name: idx_lead_tasks_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_tasks_lead ON public.lead_tasks USING btree (lead_id, created_at DESC);


--
-- Name: idx_leads_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_assigned_to ON public.leads USING btree (assigned_to);


--
-- Name: idx_leads_converted_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_converted_student ON public.leads USING btree (converted_student_id) WHERE (converted_student_id IS NOT NULL);


--
-- Name: idx_leads_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_created_at ON public.leads USING btree (created_at DESC);


--
-- Name: idx_leads_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_deleted_at ON public.leads USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_leads_interested_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_interested_course ON public.leads USING btree (interested_course_id) WHERE (interested_course_id IS NOT NULL);


--
-- Name: idx_leads_pipeline_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_pipeline_status ON public.leads USING btree (pipeline_status);


--
-- Name: idx_leads_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_source ON public.leads USING btree (source);


--
-- Name: idx_leads_trgm_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_trgm_search ON public.leads USING gin (full_name public.gin_trgm_ops, phone public.gin_trgm_ops);


--
-- Name: idx_notifications_user_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_status_created ON public.notifications USING btree (user_id, status, created_at DESC);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_deleted_at ON public.orders USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_orders_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_lead ON public.orders USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_student ON public.orders USING btree (student_id) WHERE (student_id IS NOT NULL);


--
-- Name: idx_refresh_tokens_active_user_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_active_user_expiry ON public.refresh_tokens USING btree (user_id, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_student_assessments_assessed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_assessments_assessed_by ON public.student_assessments USING btree (assessed_by);


--
-- Name: idx_student_assessments_student_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_assessments_student_class ON public.student_assessments USING btree (student_id, class_id);


--
-- Name: idx_student_profiles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_profiles_status ON public.student_profiles USING btree (status);


--
-- Name: idx_student_status_history_student_changed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_status_history_student_changed ON public.student_status_history USING btree (student_id, changed_at DESC, id DESC);


--
-- Name: idx_student_test_attempts_course_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_test_attempts_course_student ON public.student_test_attempts USING btree (course_id, student_id, test_id, attempt_no DESC);


--
-- Name: idx_students_trgm_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_trgm_search ON public.student_profiles USING gin (full_name public.gin_trgm_ops, student_code public.gin_trgm_ops);


--
-- Name: idx_teacher_assignment_periods_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_teacher_assignment_periods_one_open ON public.teacher_assignment_periods USING btree (assignment_id) WHERE (ended_at IS NULL);


--
-- Name: idx_teacher_assignment_periods_temporal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teacher_assignment_periods_temporal ON public.teacher_assignment_periods USING btree (assignment_id, started_at, ended_at);


--
-- Name: idx_teacher_assignments_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teacher_assignments_teacher_id ON public.teacher_assignments USING btree (teacher_id);


--
-- Name: idx_teacher_profiles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teacher_profiles_status ON public.teacher_profiles USING btree (status);


--
-- Name: idx_test_attempt_history_attempt_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_attempt_history_attempt_time ON public.test_attempt_history USING btree (attempt_id, changed_at DESC, id DESC);


--
-- Name: idx_test_retake_permits_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_retake_permits_lookup ON public.student_test_retake_permits USING btree (test_id, student_id, target_attempt_no);


--
-- Name: idx_user_roles_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role_id ON public.user_roles USING btree (role_id);


--
-- Name: idx_users_sale_lead_routing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_sale_lead_routing ON public.users USING btree (lead_assignment_order, email) WHERE (is_accepting_leads = true);


--
-- Name: assessment_items trg_assessment_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_assessment_items_updated_at BEFORE UPDATE ON public.assessment_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: attendance_records trg_attendance_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attendance_records_updated_at BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: class_enrollments trg_class_enrollments_capacity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_class_enrollments_capacity BEFORE INSERT OR UPDATE OF class_id, status ON public.class_enrollments FOR EACH ROW EXECUTE FUNCTION public.enforce_class_capacity();


--
-- Name: class_enrollments trg_class_enrollments_initial_period; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_class_enrollments_initial_period AFTER INSERT ON public.class_enrollments FOR EACH ROW EXECUTE FUNCTION public.create_initial_enrollment_period();


--
-- Name: class_enrollments trg_class_enrollments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_class_enrollments_updated_at BEFORE UPDATE ON public.class_enrollments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: class_sessions trg_class_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_class_sessions_updated_at BEFORE UPDATE ON public.class_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: classes trg_classes_capacity_reduction; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_classes_capacity_reduction BEFORE UPDATE OF maximum_students ON public.classes FOR EACH ROW EXECUTE FUNCTION public.prevent_capacity_reduction_below_enrollment();


--
-- Name: classes trg_classes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: competency_criteria trg_competency_criteria_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_competency_criteria_updated_at BEFORE UPDATE ON public.competency_criteria FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: course_completions trg_course_completions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_course_completions_updated_at BEFORE UPDATE ON public.course_completions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: course_modules trg_course_modules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_course_modules_updated_at BEFORE UPDATE ON public.course_modules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: courses trg_courses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lead_tasks trg_lead_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lead_tasks_updated_at BEFORE UPDATE ON public.lead_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: leads trg_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notifications trg_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: orders trg_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: student_assessments trg_student_assessments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_student_assessments_updated_at BEFORE UPDATE ON public.student_assessments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: student_profiles trg_student_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_student_profiles_updated_at BEFORE UPDATE ON public.student_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: teacher_assignments trg_teacher_assignments_initial_period; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_teacher_assignments_initial_period AFTER INSERT ON public.teacher_assignments FOR EACH ROW EXECUTE FUNCTION public.create_initial_teacher_assignment_period();


--
-- Name: teacher_assignments trg_teacher_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_teacher_assignments_updated_at BEFORE UPDATE ON public.teacher_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: teacher_profiles trg_teacher_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_teacher_profiles_updated_at BEFORE UPDATE ON public.teacher_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: training_locations trg_training_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_training_locations_updated_at BEFORE UPDATE ON public.training_locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: assessment_items assessment_items_assessment_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_items
    ADD CONSTRAINT assessment_items_assessment_fk FOREIGN KEY (assessment_id, course_id) REFERENCES public.student_assessments(id, course_id) ON DELETE CASCADE;


--
-- Name: assessment_items assessment_items_criterion_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_items
    ADD CONSTRAINT assessment_items_criterion_fk FOREIGN KEY (competency_criterion_id, course_id) REFERENCES public.competency_criteria(id, course_id) ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_enrollment_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_enrollment_fk FOREIGN KEY (class_id, student_id) REFERENCES public.class_enrollments(class_id, student_id) ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_session_class_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_session_class_fk FOREIGN KEY (class_session_id, class_id) REFERENCES public.class_sessions(id, class_id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: certificates certificates_completion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES public.course_completions(id) ON DELETE RESTRICT;


--
-- Name: certificates certificates_diploma_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_diploma_uploaded_by_fkey FOREIGN KEY (diploma_uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: certificates certificates_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: certificates certificates_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: class_enrollment_periods class_enrollment_periods_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollment_periods
    ADD CONSTRAINT class_enrollment_periods_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: class_enrollment_periods class_enrollment_periods_ended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollment_periods
    ADD CONSTRAINT class_enrollment_periods_ended_by_fkey FOREIGN KEY (ended_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: class_enrollment_periods class_enrollment_periods_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollment_periods
    ADD CONSTRAINT class_enrollment_periods_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.class_enrollments(id) ON DELETE CASCADE;


--
-- Name: class_enrollments class_enrollments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollments
    ADD CONSTRAINT class_enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;


--
-- Name: class_enrollments class_enrollments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollments
    ADD CONSTRAINT class_enrollments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: class_enrollments class_enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollments
    ADD CONSTRAINT class_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(id) ON DELETE RESTRICT;


--
-- Name: class_operation_history class_operation_history_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_operation_history
    ADD CONSTRAINT class_operation_history_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: class_operation_history class_operation_history_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_operation_history
    ADD CONSTRAINT class_operation_history_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_sessions class_sessions_class_course_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_class_course_fk FOREIGN KEY (class_id, course_id) REFERENCES public.classes(id, course_id) ON DELETE CASCADE;


--
-- Name: class_sessions class_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: class_sessions class_sessions_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.training_locations(id) ON DELETE SET NULL;


--
-- Name: class_sessions class_sessions_module_course_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_module_course_fk FOREIGN KEY (module_id, course_id) REFERENCES public.course_modules(id, course_id);


--
-- Name: class_sessions class_sessions_teacher_assignment_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_teacher_assignment_fk FOREIGN KEY (class_id, teacher_id) REFERENCES public.teacher_assignments(class_id, teacher_id);


--
-- Name: classes classes_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;


--
-- Name: competency_criteria competency_criteria_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_criteria
    ADD CONSTRAINT competency_criteria_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: competency_criteria competency_criteria_module_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_criteria
    ADD CONSTRAINT competency_criteria_module_fk FOREIGN KEY (module_id, course_id) REFERENCES public.course_modules(id, course_id);


--
-- Name: completion_decision_history completion_decision_history_completion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.completion_decision_history
    ADD CONSTRAINT completion_decision_history_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES public.course_completions(id) ON DELETE CASCADE;


--
-- Name: completion_decision_history completion_decision_history_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.completion_decision_history
    ADD CONSTRAINT completion_decision_history_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: course_completions course_completions_course_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_completions
    ADD CONSTRAINT course_completions_course_fk FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;


--
-- Name: course_completions course_completions_enrollment_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_completions
    ADD CONSTRAINT course_completions_enrollment_fk FOREIGN KEY (class_id, student_id) REFERENCES public.class_enrollments(class_id, student_id) ON DELETE RESTRICT;


--
-- Name: course_completions course_completions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_completions
    ADD CONSTRAINT course_completions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: course_modules course_modules_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_modules
    ADD CONSTRAINT course_modules_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: course_tests course_tests_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_tests
    ADD CONSTRAINT course_tests_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: lead_interactions lead_interactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_interactions
    ADD CONSTRAINT lead_interactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: lead_interactions lead_interactions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_interactions
    ADD CONSTRAINT lead_interactions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_pipeline_history lead_pipeline_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_pipeline_history
    ADD CONSTRAINT lead_pipeline_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: lead_pipeline_history lead_pipeline_history_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_pipeline_history
    ADD CONSTRAINT lead_pipeline_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_tasks lead_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tasks
    ADD CONSTRAINT lead_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: lead_tasks lead_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tasks
    ADD CONSTRAINT lead_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: lead_tasks lead_tasks_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tasks
    ADD CONSTRAINT lead_tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: leads leads_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leads leads_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leads leads_converted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_by_fkey FOREIGN KEY (converted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leads leads_converted_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_student_id_fkey FOREIGN KEY (converted_student_id) REFERENCES public.student_profiles(id) ON DELETE SET NULL;


--
-- Name: leads leads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: leads leads_interested_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_interested_course_id_fkey FOREIGN KEY (interested_course_id) REFERENCES public.courses(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: orders orders_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;


--
-- Name: orders orders_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;


--
-- Name: orders orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: orders orders_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: orders orders_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(id) ON DELETE SET NULL;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: student_test_retake_permits retake_permits_test_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_retake_permits
    ADD CONSTRAINT retake_permits_test_fk FOREIGN KEY (test_id, course_id) REFERENCES public.course_tests(id, course_id) ON DELETE CASCADE;


--
-- Name: student_assessments student_assessments_class_course_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_assessments
    ADD CONSTRAINT student_assessments_class_course_fk FOREIGN KEY (class_id, course_id) REFERENCES public.classes(id, course_id) ON DELETE CASCADE;


--
-- Name: student_assessments student_assessments_enrollment_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_assessments
    ADD CONSTRAINT student_assessments_enrollment_fk FOREIGN KEY (class_id, student_id) REFERENCES public.class_enrollments(class_id, student_id) ON DELETE RESTRICT;


--
-- Name: student_assessments student_assessments_session_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_assessments
    ADD CONSTRAINT student_assessments_session_fk FOREIGN KEY (session_id, class_id, course_id) REFERENCES public.class_sessions(id, class_id, course_id);


--
-- Name: student_assessments student_assessments_teacher_assignment_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_assessments
    ADD CONSTRAINT student_assessments_teacher_assignment_fk FOREIGN KEY (class_id, assessed_by) REFERENCES public.teacher_assignments(class_id, teacher_id);


--
-- Name: student_profiles student_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: student_status_history student_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_status_history
    ADD CONSTRAINT student_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: student_status_history student_status_history_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_status_history
    ADD CONSTRAINT student_status_history_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;


--
-- Name: student_test_attempts student_test_attempts_class_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_attempts
    ADD CONSTRAINT student_test_attempts_class_fk FOREIGN KEY (class_id, course_id) REFERENCES public.classes(id, course_id) ON DELETE RESTRICT;


--
-- Name: student_test_attempts student_test_attempts_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_attempts
    ADD CONSTRAINT student_test_attempts_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: student_test_attempts student_test_attempts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_attempts
    ADD CONSTRAINT student_test_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(id) ON DELETE RESTRICT;


--
-- Name: student_test_attempts student_test_attempts_test_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_attempts
    ADD CONSTRAINT student_test_attempts_test_fk FOREIGN KEY (test_id, course_id) REFERENCES public.course_tests(id, course_id) ON DELETE RESTRICT;


--
-- Name: student_test_retake_permits student_test_retake_permits_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_retake_permits
    ADD CONSTRAINT student_test_retake_permits_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: student_test_retake_permits student_test_retake_permits_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_test_retake_permits
    ADD CONSTRAINT student_test_retake_permits_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;


--
-- Name: teacher_assignment_periods teacher_assignment_periods_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignment_periods
    ADD CONSTRAINT teacher_assignment_periods_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.teacher_assignments(id) ON DELETE CASCADE;


--
-- Name: teacher_assignment_periods teacher_assignment_periods_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignment_periods
    ADD CONSTRAINT teacher_assignment_periods_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: teacher_assignment_periods teacher_assignment_periods_ended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignment_periods
    ADD CONSTRAINT teacher_assignment_periods_ended_by_fkey FOREIGN KEY (ended_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: teacher_assignments teacher_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: teacher_assignments teacher_assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: teacher_assignments teacher_assignments_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teacher_profiles(id) ON DELETE RESTRICT;


--
-- Name: teacher_profiles teacher_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_profiles
    ADD CONSTRAINT teacher_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: test_attempt_history test_attempt_history_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempt_history
    ADD CONSTRAINT test_attempt_history_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.student_test_attempts(id) ON DELETE CASCADE;


--
-- Name: test_attempt_history test_attempt_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempt_history
    ADD CONSTRAINT test_attempt_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: assessment_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessment_items ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: certificates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

--
-- Name: class_enrollment_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_enrollment_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: class_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: class_operation_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_operation_history ENABLE ROW LEVEL SECURITY;

--
-- Name: class_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_criteria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competency_criteria ENABLE ROW LEVEL SECURITY;

--
-- Name: completion_decision_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.completion_decision_history ENABLE ROW LEVEL SECURITY;

--
-- Name: course_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.course_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: course_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: course_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.course_tests ENABLE ROW LEVEL SECURITY;

--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: student_assessments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: student_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: student_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: student_test_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_test_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: student_test_retake_permits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_test_retake_permits ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_assignment_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_assignment_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: test_attempt_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_attempt_history ENABLE ROW LEVEL SECURITY;

--
-- Name: training_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict AqrnbwSMqOBPMFeHFcMlVzRWD2csegD3qNQulL3vMMl5LUZ8re5CTEqwhjzbrXJ

