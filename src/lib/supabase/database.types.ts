export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      building_level_milestones: {
        Row: {
          created_at: string
          level: number
          required_xp: number
        }
        Insert: {
          created_at?: string
          level: number
          required_xp: number
        }
        Update: {
          created_at?: string
          level?: number
          required_xp?: number
        }
        Relationships: []
      }
      plot_claims: {
        Row: {
          building_asset_id: string
          building_color: string
          building_level: number
          claimed_at: string
          owner_id: string
          plot_id: string
          project_id: string
          updated_at: string
          xp_total: number
        }
        Insert: {
          building_asset_id: string
          building_color: string
          building_level?: number
          claimed_at?: string
          owner_id: string
          plot_id: string
          project_id: string
          updated_at?: string
          xp_total?: number
        }
        Update: {
          building_asset_id?: string
          building_color?: string
          building_level?: number
          claimed_at?: string
          owner_id?: string
          plot_id?: string
          project_id?: string
          updated_at?: string
          xp_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "plot_claims_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_claims_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: true
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_claims_project_owner_fk"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      plot_xp_events: {
        Row: {
          awarded_by: string
          created_at: string
          description: string | null
          event_key: string
          event_type: string
          id: number
          metadata: Json
          owner_id: string
          xp_delta: number
        }
        Insert: {
          awarded_by: string
          created_at?: string
          description?: string | null
          event_key: string
          event_type: string
          id?: never
          metadata?: Json
          owner_id: string
          xp_delta: number
        }
        Update: {
          awarded_by?: string
          created_at?: string
          description?: string | null
          event_key?: string
          event_type?: string
          id?: never
          metadata?: Json
          owner_id?: string
          xp_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "plot_xp_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "city_developments"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "plot_xp_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "plot_claims"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      plots: {
        Row: {
          created_at: string
          district_id: string
          id: string
          is_active: boolean
          lot_number: number
          row_id: string
          street_id: string
          street_name: string
        }
        Insert: {
          created_at?: string
          district_id: string
          id: string
          is_active?: boolean
          lot_number: number
          row_id: string
          street_id: string
          street_name: string
        }
        Update: {
          created_at?: string
          district_id?: string
          id?: string
          is_active?: boolean
          lot_number?: number
          row_id?: string
          street_id?: string
          street_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          updated_at: string
          x_handle: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          updated_at?: string
          x_handle?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
          x_handle?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          project_type: string
          updated_at: string
          website_url: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          owner_id: string
          project_type: string
          updated_at?: string
          website_url: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          project_type?: string
          updated_at?: string
          website_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      city_developments: {
        Row: {
          avatar_url: string | null
          building_asset_id: string | null
          building_color: string | null
          building_level: number | null
          claimed_at: string | null
          current_level_xp: number | null
          founder_name: string | null
          next_level_xp: number | null
          owner_id: string | null
          plot_id: string | null
          project_id: string | null
          project_name: string | null
          project_type: string | null
          updated_at: string | null
          website_url: string | null
          x_handle: string | null
          xp_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plot_claims_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_claims_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: true
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_plot_xp: {
        Args: {
          requested_description?: string
          requested_event_key: string
          requested_event_type: string
          requested_metadata?: Json
          requested_xp_delta: number
          target_owner_id: string
        }
        Returns: {
          applied: boolean
          building_level: number
          event_key: string
          level_changed: boolean
          owner_id: string
          plot_id: string
          previous_building_level: number
          previous_xp_total: number
          xp_delta: number
          xp_total: number
        }[]
      }
      award_plot_xp: {
        Args: {
          requested_description?: string
          requested_event_key: string
          requested_event_type: string
          requested_metadata?: Json
          requested_xp_delta: number
          target_owner_id: string
        }
        Returns: {
          applied: boolean
          building_level: number
          event_key: string
          level_changed: boolean
          owner_id: string
          plot_id: string
          previous_building_level: number
          previous_xp_total: number
          xp_delta: number
          xp_total: number
        }[]
      }
      building_level_for_xp: { Args: { total_xp: number }; Returns: number }
      claim_plot: {
        Args: {
          founder_full_name: string
          founder_x_handle: string
          project_name: string
          project_uuid: string
          project_website_url: string
          requested_building_asset_id: string
          requested_building_color: string
          requested_plot_id: string
          requested_project_type: string
        }
        Returns: {
          avatar_url: string | null
          building_asset_id: string | null
          building_color: string | null
          building_level: number | null
          claimed_at: string | null
          current_level_xp: number | null
          founder_name: string | null
          next_level_xp: number | null
          owner_id: string | null
          plot_id: string | null
          project_id: string | null
          project_name: string | null
          project_type: string | null
          updated_at: string | null
          website_url: string | null
          x_handle: string | null
          xp_total: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "city_developments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      switch_claim_project: {
        Args: { requested_project_id: string }
        Returns: {
          avatar_url: string | null
          building_asset_id: string | null
          building_color: string | null
          building_level: number | null
          claimed_at: string | null
          current_level_xp: number | null
          founder_name: string | null
          next_level_xp: number | null
          owner_id: string | null
          plot_id: string | null
          project_id: string | null
          project_name: string | null
          project_type: string | null
          updated_at: string | null
          website_url: string | null
          x_handle: string | null
          xp_total: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "city_developments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_showcased_project: {
        Args: {
          founder_full_name: string
          founder_x_handle: string
          project_name: string
          project_website_url: string
          requested_building_asset_id: string
          requested_building_color: string
          requested_project_id: string
          requested_project_type: string
        }
        Returns: {
          avatar_url: string | null
          building_asset_id: string | null
          building_color: string | null
          building_level: number | null
          claimed_at: string | null
          current_level_xp: number | null
          founder_name: string | null
          next_level_xp: number | null
          owner_id: string | null
          plot_id: string | null
          project_id: string | null
          project_name: string | null
          project_type: string | null
          updated_at: string | null
          website_url: string | null
          x_handle: string | null
          xp_total: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "city_developments"
          isOneToOne: false
          isSetofReturn: true
        }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

