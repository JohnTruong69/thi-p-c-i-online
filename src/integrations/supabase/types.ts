export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          id: number
          wedding_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: never
          wedding_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: never
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_orders: {
        Row: {
          amount_vnd: number
          bank_account_name: string
          bank_account_number: string
          bank_gateway: string
          code: string
          created_at: string
          created_by: string | null
          currency: string
          entitlement_expires_at: string | null
          expires_at: string
          id: string
          offer_version: string
          paid_at: string | null
          plan_version: string
          sepay_transaction_id: number | null
          status: string
          terms_version: string
          updated_at: string
          wedding_id: string
        }
        Insert: {
          amount_vnd: number
          bank_account_name: string
          bank_account_number: string
          bank_gateway: string
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          entitlement_expires_at?: string | null
          expires_at: string
          id?: string
          offer_version: string
          paid_at?: string | null
          plan_version: string
          sepay_transaction_id?: number | null
          status?: string
          terms_version: string
          updated_at?: string
          wedding_id: string
        }
        Update: {
          amount_vnd?: number
          bank_account_name?: string
          bank_account_number?: string
          bank_gateway?: string
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          entitlement_expires_at?: string | null
          expires_at?: string
          id?: string
          offer_version?: string
          paid_at?: string | null
          plan_version?: string
          sepay_transaction_id?: number | null
          status?: string
          terms_version?: string
          updated_at?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_orders_tx_fk"
            columns: ["sepay_transaction_id"]
            isOneToOne: false
            referencedRelation: "sepay_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          account_enabled: boolean
          bank_account_name: string | null
          bank_account_number: string | null
          bank_gateway: string | null
          id: boolean
          live_enabled: boolean
          offer_version: string
          plan_version: string
          price_vnd: number
          terms_approved_at: string | null
          terms_approved_by: string | null
          terms_url: string | null
          terms_version: string
          updated_at: string
        }
        Insert: {
          account_enabled?: boolean
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_gateway?: string | null
          id?: boolean
          live_enabled?: boolean
          offer_version: string
          plan_version?: string
          price_vnd: number
          terms_approved_at?: string | null
          terms_approved_by?: string | null
          terms_url?: string | null
          terms_version: string
          updated_at?: string
        }
        Update: {
          account_enabled?: boolean
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_gateway?: string | null
          id?: boolean
          live_enabled?: boolean
          offer_version?: string
          plan_version?: string
          price_vnd?: number
          terms_approved_at?: string | null
          terms_approved_by?: string | null
          terms_url?: string | null
          terms_version?: string
          updated_at?: string
        }
        Relationships: []
      }
      budget_installments: {
        Row: {
          amount_vnd: number
          budget_item_id: string
          created_at: string
          due_date: string | null
          id: string
          label: string
          paid_at: string | null
          updated_at: string
          wedding_id: string
        }
        Insert: {
          amount_vnd: number
          budget_item_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string
          paid_at?: string | null
          updated_at?: string
          wedding_id: string
        }
        Update: {
          amount_vnd?: number
          budget_item_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string
          paid_at?: string | null
          updated_at?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_installments_budget_item_id_wedding_id_fkey"
            columns: ["budget_item_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "budget_installments_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          agreed_vnd: number | null
          category: string
          category_detail: string | null
          created_at: string
          deposit_vnd: number
          estimate_vnd: number
          event_id: string | null
          extra_vnd: number
          id: string
          label: string
          note: string | null
          paid_vnd: number
          payer: string
          updated_at: string
          vendor: string | null
          wedding_id: string
        }
        Insert: {
          agreed_vnd?: number | null
          category?: string
          category_detail?: string | null
          created_at?: string
          deposit_vnd?: number
          estimate_vnd?: number
          event_id?: string | null
          extra_vnd?: number
          id?: string
          label: string
          note?: string | null
          paid_vnd?: number
          payer?: string
          updated_at?: string
          vendor?: string | null
          wedding_id: string
        }
        Update: {
          agreed_vnd?: number | null
          category?: string
          category_detail?: string | null
          created_at?: string
          deposit_vnd?: number
          estimate_vnd?: number
          event_id?: string | null
          extra_vnd?: number
          id?: string
          label?: string
          note?: string | null
          paid_vnd?: number
          payer?: string
          updated_at?: string
          vendor?: string | null
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_event_id_wedding_id_fkey"
            columns: ["event_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "budget_items_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          created_at: string
          id: string
          requested_by: string
          resolved_at: string | null
          status: string
          updated_at: string
          wedding_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_by: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          wedding_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_by?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_deletion_requests_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          created_at: string
          event_date: string | null
          event_time: string | null
          id: string
          name: string
          side: string
          status: string
          updated_at: string
          venue: string | null
          wedding_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          event_date?: string | null
          event_time?: string | null
          id?: string
          name: string
          side?: string
          status?: string
          updated_at?: string
          venue?: string | null
          wedding_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          event_date?: string | null
          event_time?: string | null
          id?: string
          name?: string
          side?: string
          status?: string
          updated_at?: string
          venue?: string | null
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_event_assignments: {
        Row: {
          attendance_intent: string
          attending_count: number | null
          created_at: string
          event_id: string
          expected_count: number | null
          guest_id: string
          invitation_method: string
          invite_status: string
          responded_at: string | null
          response_by: string | null
          response_source: string
          rsvp_status: string
          updated_at: string
          updated_by: string | null
          wedding_id: string
        }
        Insert: {
          attendance_intent?: string
          attending_count?: number | null
          created_at?: string
          event_id: string
          expected_count?: number | null
          guest_id: string
          invitation_method?: string
          invite_status?: string
          responded_at?: string | null
          response_by?: string | null
          response_source?: string
          rsvp_status?: string
          updated_at?: string
          updated_by?: string | null
          wedding_id: string
        }
        Update: {
          attendance_intent?: string
          attending_count?: number | null
          created_at?: string
          event_id?: string
          expected_count?: number | null
          guest_id?: string
          invitation_method?: string
          invite_status?: string
          responded_at?: string | null
          response_by?: string | null
          response_source?: string
          rsvp_status?: string
          updated_at?: string
          updated_by?: string | null
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_event_assignments_event_id_wedding_id_fkey"
            columns: ["event_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "guest_event_assignments_guest_id_wedding_id_fkey"
            columns: ["guest_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "guest_event_assignments_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_import_batches: {
        Row: {
          added_count: number
          created_at: string
          created_by: string | null
          event_ids: string[]
          filename: string
          id: string
          invalid_count: number
          skipped_count: number
          undo_kept: number | null
          undo_missing: number | null
          undo_removed: number | null
          undone_at: string | null
          wedding_id: string
        }
        Insert: {
          added_count?: number
          created_at?: string
          created_by?: string | null
          event_ids?: string[]
          filename?: string
          id: string
          invalid_count?: number
          skipped_count?: number
          undo_kept?: number | null
          undo_missing?: number | null
          undo_removed?: number | null
          undone_at?: string | null
          wedding_id: string
        }
        Update: {
          added_count?: number
          created_at?: string
          created_by?: string | null
          event_ids?: string[]
          filename?: string
          id?: string
          invalid_count?: number
          skipped_count?: number
          undo_kept?: number | null
          undo_missing?: number | null
          undo_removed?: number | null
          undone_at?: string | null
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_import_batches_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_import_rows: {
        Row: {
          batch_id: string
          fingerprint: string
          guest_id: string | null
          source_row: number
          wedding_id: string
        }
        Insert: {
          batch_id: string
          fingerprint: string
          guest_id?: string | null
          source_row: number
          wedding_id: string
        }
        Update: {
          batch_id?: string
          fingerprint?: string
          guest_id?: string | null
          source_row?: number
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_import_rows_batch_id_wedding_id_fkey"
            columns: ["batch_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "guest_import_batches"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "guest_import_rows_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          created_at: string
          id: string
          name: string
          note: string | null
          party_size: number
          phone: string | null
          side: string
          updated_at: string
          wedding_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          note?: string | null
          party_size?: number
          phone?: string | null
          side?: string
          updated_at?: string
          wedding_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          party_size?: number
          phone?: string | null
          side?: string
          updated_at?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_links: {
        Row: {
          created_at: string
          enabled: boolean
          event_ids: string[]
          id: string
          invitation_id: string
          side: string
          token: string
          updated_at: string
          wedding_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          event_ids?: string[]
          id?: string
          invitation_id: string
          side: string
          token?: string
          updated_at?: string
          wedding_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          event_ids?: string[]
          id?: string
          invitation_id?: string
          side?: string
          token?: string
          updated_at?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_links_invitation_id_wedding_id_fkey"
            columns: ["invitation_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "invitation_links_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_photos: {
        Row: {
          content_hash: string
          created_at: string
          created_by: string | null
          id: string
          invitation_id: string
          mime: string
          size_bytes: number
          storage_path: string
          wedding_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          created_by?: string | null
          id?: string
          invitation_id: string
          mime: string
          size_bytes: number
          storage_path: string
          wedding_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invitation_id?: string
          mime?: string
          size_bytes?: number
          storage_path?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_photos_invitation_id_wedding_id_fkey"
            columns: ["invitation_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "invitation_photos_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invitation_id: string
          kind: string
          note: string
          revision: number
          snapshot: Json
          wedding_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invitation_id: string
          kind?: string
          note?: string
          revision: number
          snapshot: Json
          wedding_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invitation_id?: string
          kind?: string
          note?: string
          revision?: number
          snapshot?: Json
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_revisions_invitation_id_wedding_id_fkey"
            columns: ["invitation_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "invitation_revisions_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          cover_photo_id: string | null
          created_at: string
          id: string
          message: string
          published_at: string | null
          published_revision_id: string | null
          template: string
          title: string
          updated_at: string
          wedding_id: string
        }
        Insert: {
          cover_photo_id?: string | null
          created_at?: string
          id?: string
          message?: string
          published_at?: string | null
          published_revision_id?: string | null
          template?: string
          title?: string
          updated_at?: string
          wedding_id: string
        }
        Update: {
          cover_photo_id?: string | null
          created_at?: string
          id?: string
          message?: string
          published_at?: string | null
          published_revision_id?: string | null
          template?: string
          title?: string
          updated_at?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_cover_fk"
            columns: ["cover_photo_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "invitation_photos"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "invitations_published_fk"
            columns: ["published_revision_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "invitation_revisions"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "invitations_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: true
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rsvp_answers: {
        Row: {
          attending: boolean
          event_id: string
          event_name: string
          party_size: number | null
          response_id: string
          wedding_id: string
        }
        Insert: {
          attending: boolean
          event_id: string
          event_name: string
          party_size?: number | null
          response_id: string
          wedding_id: string
        }
        Update: {
          attending?: boolean
          event_id?: string
          event_name?: string
          party_size?: number | null
          response_id?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "rsvp_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_answers_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvp_rate_buckets: {
        Row: {
          hits: number
          link_id: string
          window_kind: string
          window_start: string
        }
        Insert: {
          hits: number
          link_id: string
          window_kind: string
          window_start: string
        }
        Update: {
          hits?: number
          link_id?: string
          window_kind?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_rate_buckets_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "invitation_links"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvp_responses: {
        Row: {
          created_at: string
          edit_code_hash: string
          guest_id: string | null
          guest_name: string
          id: string
          link_id: string
          link_side: string
          matched_at: string | null
          matched_by: string | null
          note: string | null
          phone: string | null
          replaces_id: string | null
          request_key: string
          revision_id: string
          superseded_at: string | null
          wedding_id: string
        }
        Insert: {
          created_at?: string
          edit_code_hash: string
          guest_id?: string | null
          guest_name: string
          id?: string
          link_id: string
          link_side: string
          matched_at?: string | null
          matched_by?: string | null
          note?: string | null
          phone?: string | null
          replaces_id?: string | null
          request_key: string
          revision_id: string
          superseded_at?: string | null
          wedding_id: string
        }
        Update: {
          created_at?: string
          edit_code_hash?: string
          guest_id?: string | null
          guest_name?: string
          id?: string
          link_id?: string
          link_side?: string
          matched_at?: string | null
          matched_by?: string | null
          note?: string | null
          phone?: string | null
          replaces_id?: string | null
          request_key?: string
          revision_id?: string
          superseded_at?: string | null
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_responses_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_responses_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "invitation_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_responses_replaces_id_fkey"
            columns: ["replaces_id"]
            isOneToOne: false
            referencedRelation: "rsvp_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_responses_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "invitation_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_responses_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      sepay_transactions: {
        Row: {
          account_number: string
          code: string | null
          content: string
          gateway: string
          id: number
          match_status: string
          order_id: string | null
          raw: Json
          received_at: string
          reference_code: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          sepay_id: number
          transaction_date: string
          transfer_amount: number
          transfer_type: string
          unmatched_reason: string | null
        }
        Insert: {
          account_number: string
          code?: string | null
          content: string
          gateway: string
          id?: never
          match_status?: string
          order_id?: string | null
          raw: Json
          received_at?: string
          reference_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sepay_id: number
          transaction_date: string
          transfer_amount: number
          transfer_type: string
          unmatched_reason?: string | null
        }
        Update: {
          account_number?: string
          code?: string | null
          content?: string
          gateway?: string
          id?: never
          match_status?: string
          order_id?: string | null
          raw?: Json
          received_at?: string
          reference_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sepay_id?: number
          transaction_date?: string
          transfer_amount?: number
          transfer_type?: string
          unmatched_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sepay_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "billing_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee: string
          created_at: string
          due_date: string | null
          event_id: string | null
          id: string
          kind: string
          note: string | null
          outcome: string | null
          planned_tables: number | null
          reserve_tables: number | null
          source: string
          status: string
          template_id: string | null
          title: string
          updated_at: string
          wedding_id: string
        }
        Insert: {
          assignee?: string
          created_at?: string
          due_date?: string | null
          event_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          outcome?: string | null
          planned_tables?: number | null
          reserve_tables?: number | null
          source?: string
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
          wedding_id: string
        }
        Update: {
          assignee?: string
          created_at?: string
          due_date?: string | null
          event_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          outcome?: string | null
          planned_tables?: number | null
          reserve_tables?: number | null
          source?: string
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_event_id_wedding_id_fkey"
            columns: ["event_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "wedding_id"]
          },
          {
            foreignKeyName: "tasks_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wedding_entitlements: {
        Row: {
          created_at: string
          expires_at: string
          paid_at: string
          plan_version: string
          source: string
          wedding_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          paid_at: string
          plan_version?: string
          source: string
          wedding_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          paid_at?: string
          plan_version?: string
          source?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_entitlements_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: true
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_invites: {
        Row: {
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          status: string
          token_hash: string
          updated_at: string
          wedding_id: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          status?: string
          token_hash: string
          updated_at?: string
          wedding_id: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_invites_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_memberships: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          wedding_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          wedding_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_memberships_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_viewer_invites: {
        Row: {
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          modules: string[]
          sides: string[]
          status: string
          token_hash: string
          updated_at: string
          wedding_id: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          modules: string[]
          sides: string[]
          status?: string
          token_hash: string
          updated_at?: string
          wedding_id: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          modules?: string[]
          sides?: string[]
          status?: string
          token_hash?: string
          updated_at?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_viewer_invites_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_viewers: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          modules: string[]
          revoked_at: string | null
          sides: string[]
          updated_at: string
          user_id: string
          wedding_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          modules: string[]
          revoked_at?: string | null
          sides: string[]
          updated_at?: string
          user_id: string
          wedding_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          modules?: string[]
          revoked_at?: string | null
          sides?: string[]
          updated_at?: string
          user_id?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_viewers_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_write_gate: {
        Row: {
          enabled_at: string
          note: string | null
          wedding_id: string
        }
        Insert: {
          enabled_at?: string
          note?: string | null
          wedding_id: string
        }
        Update: {
          enabled_at?: string
          note?: string | null
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_write_gate_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: true
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      weddings: {
        Row: {
          budget_cap_vnd: number | null
          created_at: string
          created_by: string
          id: string
          partner_one_name: string
          partner_two_name: string
          planned_date: string | null
          status: string
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          budget_cap_vnd?: number | null
          created_at?: string
          created_by: string
          id?: string
          partner_one_name: string
          partner_two_name: string
          planned_date?: string | null
          status?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          budget_cap_vnd?: number | null
          created_at?: string
          created_by?: string
          id?: string
          partner_one_name?: string
          partner_two_name?: string
          planned_date?: string | null
          status?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_partner_invite: { Args: { p_token: string }; Returns: string }
      accept_viewer_invite: { Args: { p_token: string }; Returns: string }
      billing_is_service: { Args: never; Returns: boolean }
      billing_offer_status: { Args: never; Returns: Json }
      can_manage_photo_path: { Args: { p_name: string }; Returns: boolean }
      can_write_photo_path: { Args: { p_name: string }; Returns: boolean }
      create_billing_order: {
        Args: { p_user_id: string; p_wedding_id: string }
        Returns: Json
      }
      create_partner_invite: {
        Args: { p_email: string; p_wedding_id: string }
        Returns: {
          expires_at: string
          invite_id: string
          token: string
        }[]
      }
      create_viewer_invite: {
        Args: {
          p_email: string
          p_modules: string[]
          p_sides: string[]
          p_wedding_id: string
        }
        Returns: {
          expires_at: string
          invite_id: string
          token: string
        }[]
      }
      create_wedding_draft: {
        Args: {
          p_event_date?: string
          p_event_name: string
          p_event_side?: string
          p_partner_one: string
          p_partner_two: string
          p_planned_date: string
        }
        Returns: string
      }
      enable_wedding_write_gate: {
        Args: { p_note?: string; p_start_trial?: boolean; p_wedding_id: string }
        Returns: Json
      }
      ensure_invitation: { Args: { p_wedding_id: string }; Returns: string }
      export_wedding_data: { Args: { p_wedding_id: string }; Returns: Json }
      get_rsvp_receipt: {
        Args: { p_edit_code: string; p_token: string }
        Returns: Json
      }
      guest_fingerprint: { Args: { p_guest_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_valid_entitlement: {
        Args: { p_wedding_id: string }
        Returns: boolean
      }
      import_guest_batch: {
        Args: {
          p_batch_id: string
          p_event_ids: string[]
          p_filename: string
          p_invalid: number
          p_rows: Json
          p_skipped: number
          p_wedding_id: string
        }
        Returns: Json
      }
      inspect_invite: {
        Args: { p_token: string }
        Returns: {
          email_matches: boolean
          expires_at: string
          status: string
        }[]
      }
      inspect_viewer_invite: {
        Args: { p_token: string }
        Returns: {
          email_matches: boolean
          expires_at: string
          status: string
        }[]
      }
      invitation_snapshot: { Args: { p_invitation_id: string }; Returns: Json }
      is_wedding_manager: { Args: { _wedding_id: string }; Returns: boolean }
      match_sepay_transaction: {
        Args: {
          p_actor: string
          p_note: string
          p_order_id: string
          p_tx: number
        }
        Returns: Json
      }
      photo_slot_available: { Args: { p_wedding: string }; Returns: boolean }
      public_invitation: { Args: { p_token: string }; Returns: Json }
      public_invitation_photo_paths: {
        Args: { p_token: string }
        Returns: Json
      }
      publish_invitation: { Args: { p_wedding_id: string }; Returns: Json }
      reconcile_rsvp: {
        Args: { p_apply?: boolean; p_guest_id: string; p_response_id: string }
        Returns: number
      }
      record_sepay_transaction: { Args: { p: Json }; Returns: Json }
      register_invitation_photo: {
        Args: { p_path: string; p_wedding_id: string }
        Returns: string
      }
      remove_event: { Args: { p_event_id: string }; Returns: Json }
      remove_invitation_photo: { Args: { p_photo_id: string }; Returns: string }
      remove_manager: { Args: { p_membership_id: string }; Returns: undefined }
      request_wedding_data_deletion: {
        Args: { p_wedding_id: string }
        Returns: string
      }
      revoke_partner_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      revoke_viewer: { Args: { p_viewer_id: string }; Returns: undefined }
      revoke_viewer_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      rsvp_link_context: { Args: { p_token: string }; Returns: Json }
      rsvp_receipt_json: { Args: { p_id: string }; Returns: Json }
      save_budget_item: {
        Args: {
          p_installments: Json
          p_item: Json
          p_item_id: string
          p_wedding_id: string
        }
        Returns: string
      }
      save_guest: {
        Args: {
          p_assignments: Json
          p_guest: Json
          p_guest_id: string
          p_wedding_id: string
        }
        Returns: string
      }
      save_invitation_revision: {
        Args: { p_note?: string; p_wedding_id: string }
        Returns: Json
      }
      shares_wedding_with: { Args: { _user_id: string }; Returns: boolean }
      snapshot_link_ready: {
        Args: { p_side: string; p_snap: Json }
        Returns: boolean
      }
      submit_rsvp: {
        Args: {
          p_answers: Json
          p_edit_code?: string
          p_name: string
          p_note: string
          p_phone: string
          p_request_key: string
          p_token: string
        }
        Returns: Json
      }
      undo_guest_batch: { Args: { p_batch_id: string }; Returns: Json }
      unmatch_rsvp: { Args: { p_response_id: string }; Returns: undefined }
      update_event_with_impact: {
        Args: { p_event_id: string; p_fields: Json; p_shift_task_ids: string[] }
        Returns: number
      }
      update_viewer_grants: {
        Args: { p_modules: string[]; p_sides: string[]; p_viewer_id: string }
        Returns: undefined
      }
      viewer_norm: {
        Args: { p: string[]; p_allowed: string[] }
        Returns: string[]
      }
      viewer_projection: { Args: { p_wedding_id: string }; Returns: Json }
      viewer_slots_used: {
        Args: { p_except_email: string; p_wedding_id: string }
        Returns: number
      }
      viewer_weddings: { Args: never; Returns: Json }
      wedding_access_state: { Args: { p_wedding_id: string }; Returns: Json }
      wedding_access_state_internal: {
        Args: { p_wedding_id: string }
        Returns: Json
      }
      wedding_write_allowed: {
        Args: { p_wedding_id: string }
        Returns: boolean
      }
      withdraw_wedding_data_deletion: {
        Args: { p_request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
    },
  },
} as const
