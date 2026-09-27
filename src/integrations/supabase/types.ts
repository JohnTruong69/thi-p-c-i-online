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
          created_at: string
          event_id: string
          guest_id: string
          wedding_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          guest_id: string
          wedding_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          guest_id?: string
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
      create_partner_invite: {
        Args: { p_email: string; p_wedding_id: string }
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
      inspect_invite: {
        Args: { p_token: string }
        Returns: {
          email_matches: boolean
          expires_at: string
          status: string
        }[]
      }
      is_wedding_manager: { Args: { _wedding_id: string }; Returns: boolean }
      remove_event: { Args: { p_event_id: string }; Returns: Json }
      remove_manager: { Args: { p_membership_id: string }; Returns: undefined }
      revoke_partner_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      save_budget_item: {
        Args: {
          p_installments: Json
          p_item: Json
          p_item_id: string
          p_wedding_id: string
        }
        Returns: string
      }
      shares_wedding_with: { Args: { _user_id: string }; Returns: boolean }
      update_event_with_impact: {
        Args: { p_event_id: string; p_fields: Json; p_shift_task_ids: string[] }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
