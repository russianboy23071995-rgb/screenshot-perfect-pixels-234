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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          is_test: boolean
          new_data: Json | null
          note: string | null
          old_data: Json | null
          user_id: string
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          is_test?: boolean
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
          user_id?: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          is_test?: boolean
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          color: string
          created_at: string
          id: string
          is_demo: boolean
          name: string
          sort_order: number
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          sort_order?: number
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          confidence: number | null
          created_at: string
          extracted_data: Json | null
          file_type: string
          filename: string
          id: string
          is_demo: boolean
          local_path: string | null
          original_filename: string
          received_at: string | null
          review_note: string | null
          review_status: string
          sender: string | null
          sha256: string | null
          source: string | null
          source_ref: string | null
          storage_path: string
          subject: string | null
          sync_status: string
          synced_at: string | null
          transaction_id: string | null
          upload_date: string
          user_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          extracted_data?: Json | null
          file_type: string
          filename: string
          id?: string
          is_demo?: boolean
          local_path?: string | null
          original_filename: string
          received_at?: string | null
          review_note?: string | null
          review_status?: string
          sender?: string | null
          sha256?: string | null
          source?: string | null
          source_ref?: string | null
          storage_path: string
          subject?: string | null
          sync_status?: string
          synced_at?: string | null
          transaction_id?: string | null
          upload_date?: string
          user_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          extracted_data?: Json | null
          file_type?: string
          filename?: string
          id?: string
          is_demo?: boolean
          local_path?: string | null
          original_filename?: string
          received_at?: string | null
          review_note?: string | null
          review_status?: string
          sender?: string | null
          sha256?: string | null
          source?: string | null
          source_ref?: string | null
          storage_path?: string
          subject?: string | null
          sync_status?: string
          synced_at?: string | null
          transaction_id?: string | null
          upload_date?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          active_fiscal_year: number
          address: string
          advance_period: string
          bank_account: string
          company_name: string
          currency: string
          default_payment_method: string
          default_tax_rate: number
          filename_scheme: string
          id: string
          local_folder: string
          owner_name: string
          permanent_extension: boolean
          tax_number: string
          tax_rates: Json
          taxation_method: string
          test_mode: boolean
          updated_at: string
          user_id: string | null
          vat_id: string
          vat_liable: boolean
        }
        Insert: {
          active_fiscal_year?: number
          address?: string
          advance_period?: string
          bank_account?: string
          company_name?: string
          currency?: string
          default_payment_method?: string
          default_tax_rate?: number
          filename_scheme?: string
          id?: string
          local_folder?: string
          owner_name?: string
          permanent_extension?: boolean
          tax_number?: string
          tax_rates?: Json
          taxation_method?: string
          test_mode?: boolean
          updated_at?: string
          user_id?: string | null
          vat_id?: string
          vat_liable?: boolean
        }
        Update: {
          active_fiscal_year?: number
          address?: string
          advance_period?: string
          bank_account?: string
          company_name?: string
          currency?: string
          default_payment_method?: string
          default_tax_rate?: number
          filename_scheme?: string
          id?: string
          local_folder?: string
          owner_name?: string
          permanent_extension?: boolean
          tax_number?: string
          tax_rates?: Json
          taxation_method?: string
          test_mode?: boolean
          updated_at?: string
          user_id?: string | null
          vat_id?: string
          vat_liable?: boolean
        }
        Relationships: []
      }
      tax_periods: {
        Row: {
          created_at: string
          due_date: string
          fiscal_year: number
          id: string
          notes: string | null
          period_end: string
          period_start: string
          quarter: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          due_date: string
          fiscal_year: number
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          quarter: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          due_date?: string
          fiscal_year?: number
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          quarter?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bewirtung: Json | null
          booking_status: string
          category_id: string | null
          counterparty: string
          counterparty_vat_id: string | null
          created_at: string
          currency: string
          deductible: string
          deductible_percent: number
          deductible_tax_cents: number
          description: string
          fiscal_year: number
          gross_cents: number
          id: string
          input_tax_percent: number
          invoice_date: string
          invoice_number: string | null
          is_demo: boolean
          net_cents: number
          notes: string | null
          original_gross_cents: number | null
          original_net_cents: number | null
          original_tax_cents: number | null
          payment_date: string | null
          payment_method: string
          payment_status: string
          reverse_charge: boolean
          service_date: string | null
          storno_of: string | null
          tax_cents: number
          tax_lines: Json
          tax_rate: number
          tip_cents: number
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bewirtung?: Json | null
          booking_status?: string
          category_id?: string | null
          counterparty?: string
          counterparty_vat_id?: string | null
          created_at?: string
          currency?: string
          deductible?: string
          deductible_percent?: number
          deductible_tax_cents?: number
          description?: string
          fiscal_year: number
          gross_cents?: number
          id?: string
          input_tax_percent?: number
          invoice_date: string
          invoice_number?: string | null
          is_demo?: boolean
          net_cents?: number
          notes?: string | null
          original_gross_cents?: number | null
          original_net_cents?: number | null
          original_tax_cents?: number | null
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          reverse_charge?: boolean
          service_date?: string | null
          storno_of?: string | null
          tax_cents?: number
          tax_lines?: Json
          tax_rate?: number
          tip_cents?: number
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bewirtung?: Json | null
          booking_status?: string
          category_id?: string | null
          counterparty?: string
          counterparty_vat_id?: string | null
          created_at?: string
          currency?: string
          deductible?: string
          deductible_percent?: number
          deductible_tax_cents?: number
          description?: string
          fiscal_year?: number
          gross_cents?: number
          id?: string
          input_tax_percent?: number
          invoice_date?: string
          invoice_number?: string | null
          is_demo?: boolean
          net_cents?: number
          notes?: string | null
          original_gross_cents?: number | null
          original_net_cents?: number | null
          original_tax_cents?: number | null
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          reverse_charge?: boolean
          service_date?: string | null
          storno_of?: string | null
          tax_cents?: number
          tax_lines?: Json
          tax_rate?: number
          tip_cents?: number
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_storno_of_fkey"
            columns: ["storno_of"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_profiles: {
        Row: {
          category_id: string | null
          counterparty_key: string
          deductible: string
          deductible_percent: number
          default_description: string | null
          display_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          counterparty_key: string
          deductible?: string
          deductible_percent?: number
          default_description?: string | null
          display_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          category_id?: string | null
          counterparty_key?: string
          deductible?: string
          deductible_percent?: number
          default_description?: string | null
          display_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_profiles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      finish_test_cleanup:
        | {
            Args: { p_document_ids: string[]; p_file_count: number }
            Returns: Json
          }
        | {
            Args: {
              p_document_ids: string[]
              p_file_count: number
              p_owner: string
            }
            Returns: Json
          }
      negate_tax_lines: { Args: { p: Json }; Returns: Json }
      storno_transaction: {
        Args: { p_create_copy?: boolean; p_id: string }
        Returns: Json
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
