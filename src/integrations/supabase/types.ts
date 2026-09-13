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
          original_filename: string
          storage_path: string
          sync_status: string
          transaction_id: string | null
          upload_date: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          extracted_data?: Json | null
          file_type: string
          filename: string
          id?: string
          is_demo?: boolean
          original_filename: string
          storage_path: string
          sync_status?: string
          transaction_id?: string | null
          upload_date?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          extracted_data?: Json | null
          file_type?: string
          filename?: string
          id?: string
          is_demo?: boolean
          original_filename?: string
          storage_path?: string
          sync_status?: string
          transaction_id?: string | null
          upload_date?: string
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
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
        }
        Relationships: []
      }
      transactions: {
        Row: {
          category_id: string | null
          counterparty: string
          created_at: string
          deductible: string
          deductible_percent: number
          deductible_tax_cents: number
          description: string
          fiscal_year: number
          gross_cents: number
          id: string
          invoice_date: string
          invoice_number: string | null
          is_demo: boolean
          net_cents: number
          notes: string | null
          payment_date: string | null
          payment_method: string
          payment_status: string
          service_date: string | null
          tax_cents: number
          tax_rate: number
          type: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          counterparty?: string
          created_at?: string
          deductible?: string
          deductible_percent?: number
          deductible_tax_cents?: number
          description?: string
          fiscal_year: number
          gross_cents?: number
          id?: string
          invoice_date: string
          invoice_number?: string | null
          is_demo?: boolean
          net_cents?: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          service_date?: string | null
          tax_cents?: number
          tax_rate?: number
          type: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          counterparty?: string
          created_at?: string
          deductible?: string
          deductible_percent?: number
          deductible_tax_cents?: number
          description?: string
          fiscal_year?: number
          gross_cents?: number
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          is_demo?: boolean
          net_cents?: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          service_date?: string | null
          tax_cents?: number
          tax_rate?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
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
      [_ in never]: never
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
