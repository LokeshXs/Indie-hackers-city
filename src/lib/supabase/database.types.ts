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
      achievement_definitions: {
        Row: {
          achievement_type: string
          created_at: string
          description: string
          evidence_hint: string
          evidence_prompt: string
          group_key: string
          label: string
          requires_new_project: boolean
          scope: string
          sort_order: number
          tier: number
          xp_reward: number
        }
        Insert: {
          achievement_type: string
          created_at?: string
          description: string
          evidence_hint: string
          evidence_prompt: string
          group_key: string
          label: string
          requires_new_project?: boolean
          scope: string
          sort_order: number
          tier: number
          xp_reward: number
        }
        Update: {
          achievement_type?: string
          created_at?: string
          description?: string
          evidence_hint?: string
          evidence_prompt?: string
          group_key?: string
          label?: string
          requires_new_project?: boolean
          scope?: string
          sort_order?: number
          tier?: number
          xp_reward?: number
        }
        Relationships: []
      }
      achievement_evidence: {
        Row: {
          achievement_id: number
          created_at: string
          file_path: string | null
          id: number
          link: string | null
          note: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          achievement_id: number
          created_at?: string
          file_path?: string | null
          id?: never
          link?: string | null
          note?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          achievement_id?: number
          created_at?: string
          file_path?: string | null
          id?: never
          link?: string | null
          note?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievement_evidence_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: true
            referencedRelation: "project_achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievement_evidence_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "city_developments"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "achievement_evidence_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "plot_claims"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      achievement_reviews: {
        Row: {
          achievement_id: number
          achievement_type: string
          created_at: string
          decision: string
          id: number
          ledger_event_key: string | null
          note: string | null
          owner_id: string
          reviewer_id: string | null
          reviewer_label: string
          xp_delta: number
        }
        Insert: {
          achievement_id: number
          achievement_type: string
          created_at?: string
          decision: string
          id?: never
          ledger_event_key?: string | null
          note?: string | null
          owner_id: string
          reviewer_id?: string | null
          reviewer_label: string
          xp_delta?: number
        }
        Update: {
          achievement_id?: number
          achievement_type?: string
          created_at?: string
          decision?: string
          id?: never
          ledger_event_key?: string | null
          note?: string | null
          owner_id?: string
          reviewer_id?: string | null
          reviewer_label?: string
          xp_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "achievement_reviews_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "project_achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievement_reviews_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "city_developments"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "achievement_reviews_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "plot_claims"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      admin_config_changes: {
        Row: {
          actor_id: string | null
          actor_label: string
          created_at: string
          entity: string
          entity_id: string
          field: string
          founders_affected: number
          id: number
          new_value: string
          previous_value: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_label: string
          created_at?: string
          entity: string
          entity_id: string
          field: string
          founders_affected?: number
          id?: never
          new_value: string
          previous_value?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          entity?: string
          entity_id?: string
          field?: string
          founders_affected?: number
          id?: never
          new_value?: string
          previous_value?: string | null
        }
        Relationships: []
      }
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
          billboard_background_color: string
          billboard_text_color: string
          building_asset_id: string
          building_level: number
          claimed_at: string
          owner_id: string
          plot_id: string
          project_id: string
          rewards_seen_at: string
          status_text: string | null
          updated_at: string
          xp_total: number
        }
        Insert: {
          billboard_background_color?: string
          billboard_text_color?: string
          building_asset_id: string
          building_level?: number
          claimed_at?: string
          owner_id: string
          plot_id: string
          project_id: string
          rewards_seen_at?: string
          status_text?: string | null
          updated_at?: string
          xp_total?: number
        }
        Update: {
          billboard_background_color?: string
          billboard_text_color?: string
          building_asset_id?: string
          building_level?: number
          claimed_at?: string
          owner_id?: string
          plot_id?: string
          project_id?: string
          rewards_seen_at?: string
          status_text?: string | null
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
      plot_shares: {
        Row: {
          avatar_url: string | null
          created_at: string
          development_revision: string
          founder_name: string
          id: string
          image_path: string
          owner_id: string
          phase: string
          plot_id: string
          ready_at: string | null
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          development_revision: string
          founder_name: string
          id: string
          image_path: string
          owner_id: string
          phase: string
          plot_id: string
          ready_at?: string | null
          xp: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          development_revision?: string
          founder_name?: string
          id?: string
          image_path?: string
          owner_id?: string
          phase?: string
          plot_id?: string
          ready_at?: string | null
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "plot_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_shares_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
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
      project_achievements: {
        Row: {
          achievement_type: string
          created_at: string
          event_key: string
          id: number
          owner_id: string
          project_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          xp_awarded: number
        }
        Insert: {
          achievement_type: string
          created_at?: string
          event_key: string
          id?: never
          owner_id: string
          project_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          xp_awarded: number
        }
        Update: {
          achievement_type?: string
          created_at?: string
          event_key?: string
          id?: never
          owner_id?: string
          project_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          xp_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_achievements_achievement_type_fkey"
            columns: ["achievement_type"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["achievement_type"]
          },
          {
            foreignKeyName: "project_achievements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "city_developments"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "project_achievements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "plot_claims"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "project_achievements_project_owner_fk"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "owner_id"]
          },
        ]
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
          billboard_background_color: string | null
          billboard_text_color: string | null
          building_asset_id: string | null
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
          status_text: string | null
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
      acknowledge_rewards: { Args: never; Returns: string }
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
      apply_project_achievement: {
        Args: {
          evidence_file_path?: string
          evidence_link?: string
          evidence_note?: string
          requested_achievement_type: string
          target_owner_id: string
          target_project_id: string
        }
        Returns: {
          awarded_project_id: string
          awarded_status: string
          awarded_type: string
          awarded_xp_pending: number
          resulting_building_level: number
          resulting_xp_total: number
        }[]
      }
      approve_achievement: {
        Args: {
          reviewer_note?: string
          reviewer_user_id?: string
          target_achievement_id: number
        }
        Returns: {
          approved_count: number
          building_level: number
          level_changed: boolean
          xp_awarded: number
          xp_total: number
        }[]
      }
      assert_reviewer: { Args: never; Returns: string }
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
          requested_billboard_background_color: string
          requested_billboard_text_color: string
          requested_building_asset_id: string
          requested_plot_id: string
          requested_project_type: string
        }
        Returns: {
          avatar_url: string | null
          billboard_background_color: string | null
          billboard_text_color: string | null
          building_asset_id: string | null
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
          status_text: string | null
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
      create_project: {
        Args: {
          evidence_link?: string
          evidence_note?: string
          project_name: string
          project_uuid: string
          project_website_url: string
          requested_project_type: string
          showcase_on_billboard?: boolean
        }
        Returns: {
          avatar_url: string | null
          billboard_background_color: string | null
          billboard_text_color: string | null
          building_asset_id: string | null
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
          status_text: string | null
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
      prepare_plot_share: {
        Args: {
          expected_revision: string
          request_id: string
          requested_phase: string
        }
        Returns: {
          avatar_url: string | null
          created_at: string
          development_revision: string
          founder_name: string
          id: string
          image_path: string
          owner_id: string
          phase: string
          plot_id: string
          ready_at: string | null
          xp: number
        }[]
        SetofOptions: {
          from: "*"
          to: "plot_shares"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      publish_plot_share: {
        Args: { request_id: string }
        Returns: {
          avatar_url: string | null
          created_at: string
          development_revision: string
          founder_name: string
          id: string
          image_path: string
          owner_id: string
          phase: string
          plot_id: string
          ready_at: string | null
          xp: number
        }[]
        SetofOptions: {
          from: "*"
          to: "plot_shares"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_achievement: {
        Args: {
          evidence_file_path?: string
          evidence_link?: string
          evidence_note?: string
          requested_achievement_type: string
          requested_project_id?: string
        }
        Returns: {
          achievement_type: string
          building_level: number
          project_id: string
          status: string
          xp_pending: number
          xp_total: number
        }[]
      }
      reject_achievement: {
        Args: {
          reviewer_note?: string
          reviewer_user_id?: string
          target_achievement_id: number
        }
        Returns: {
          building_level: number
          rejected_type: string
          xp_total: number
        }[]
      }
      revoke_achievement: {
        Args: {
          reviewer_note?: string
          reviewer_user_id?: string
          target_achievement_id: number
        }
        Returns: {
          building_level: number
          level_changed: boolean
          revoked_type: string
          xp_removed: number
          xp_total: number
        }[]
      }
      reward_announcement: {
        Args: never
        Returns: {
          achievements: Json
          building_level: number
          level_changed: boolean
          previous_building_level: number
          previous_xp_total: number
          xp_gained: number
          xp_total: number
        }[]
      }
      set_level_milestone: {
        Args: {
          actor_user_id?: string
          new_required_xp: number
          target_level: number
        }
        Returns: {
          founders_relevelled: number
          level: number
          required_xp: number
        }[]
      }
      switch_claim_project: {
        Args: { requested_project_id: string }
        Returns: {
          avatar_url: string | null
          billboard_background_color: string | null
          billboard_text_color: string | null
          building_asset_id: string | null
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
          status_text: string | null
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
      update_achievement_definition: {
        Args: {
          actor_user_id?: string
          new_description?: string
          new_evidence_hint?: string
          new_evidence_prompt?: string
          new_label?: string
          new_xp_reward?: number
          target_achievement_type: string
        }
        Returns: {
          achievement_type: string
          created_at: string
          description: string
          evidence_hint: string
          evidence_prompt: string
          group_key: string
          label: string
          requires_new_project: boolean
          scope: string
          sort_order: number
          tier: number
          xp_reward: number
        }[]
        SetofOptions: {
          from: "*"
          to: "achievement_definitions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_plot_appearance: {
        Args: {
          requested_billboard_background_color: string
          requested_billboard_text_color: string
        }
        Returns: {
          avatar_url: string | null
          billboard_background_color: string | null
          billboard_text_color: string | null
          building_asset_id: string | null
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
          status_text: string | null
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
      update_plot_status: {
        Args: { requested_status_text: string }
        Returns: {
          avatar_url: string | null
          billboard_background_color: string | null
          billboard_text_color: string | null
          building_asset_id: string | null
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
          status_text: string | null
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
      update_project: {
        Args: {
          project_name: string
          project_website_url: string
          requested_project_id: string
          requested_project_type: string
          showcase_on_billboard: boolean
        }
        Returns: {
          avatar_url: string | null
          billboard_background_color: string | null
          billboard_text_color: string | null
          building_asset_id: string | null
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
          status_text: string | null
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
      upgrade_plot_premises: {
        Args: { requested_building_asset_id: string }
        Returns: {
          avatar_url: string | null
          billboard_background_color: string | null
          billboard_text_color: string | null
          building_asset_id: string | null
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
          status_text: string | null
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

