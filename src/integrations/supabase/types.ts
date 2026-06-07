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
      group_join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          message: string | null
          requester_avatar: string | null
          requester_id: string
          requester_name: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id: string
          id?: string
          message?: string | null
          requester_avatar?: string | null
          requester_id: string
          requester_name: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string
          id?: string
          message?: string | null
          requester_avatar?: string | null
          requester_id?: string
          requester_name?: string
          status?: string
        }
        Relationships: []
      }
      lost_reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          missing_name: string
          photo_url: string | null
          reporter_id: string
          reporter_name: string
          reporter_phone: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          missing_name: string
          photo_url?: string | null
          reporter_id: string
          reporter_name: string
          reporter_phone?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          missing_name?: string
          photo_url?: string | null
          reporter_id?: string
          reporter_name?: string
          reporter_phone?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: []
      }
      member_locations: {
        Row: {
          group_id: string
          id: string
          lat: number
          lng: number
          updated_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          lat: number
          lng: number
          updated_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          lat?: number
          lng?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_locations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tour_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department_type: string | null
          digital_id: string
          email: string
          emergency_contact: string | null
          full_name: string
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          department_type?: string | null
          digital_id: string
          email: string
          emergency_contact?: string | null
          full_name: string
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          department_type?: string | null
          digital_id?: string
          email?: string
          emergency_contact?: string | null
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      separation_alerts: {
        Row: {
          created_at: string
          distance_km: number
          group_id: string
          id: string
          lat: number
          lng: number
          severity: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          distance_km: number
          group_id: string
          id?: string
          lat: number
          lng: number
          severity: string
          user_id: string
          user_name: string
        }
        Update: {
          created_at?: string
          distance_km?: number
          group_id?: string
          id?: string
          lat?: number
          lng?: number
          severity?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "separation_alerts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tour_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_tour_comments: {
        Row: {
          created_at: string
          id: string
          text: string
          tour_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          text: string
          tour_id: string
          user_id: string
          user_name: string
        }
        Update: {
          created_at?: string
          id?: string
          text?: string
          tour_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_tour_comments_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "shared_tours"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_tour_likes: {
        Row: {
          created_at: string
          id: string
          tour_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tour_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_tour_likes_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "shared_tours"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_tour_ratings: {
        Row: {
          created_at: string
          id: string
          rating: number
          tour_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          tour_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_tour_ratings_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "shared_tours"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_tour_saves: {
        Row: {
          created_at: string
          id: string
          tour_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tour_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_tour_saves_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "shared_tours"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_tours: {
        Row: {
          comments_count: number
          created_at: string
          creator_avatar: string | null
          creator_id: string
          creator_name: string
          description: string | null
          dest_label: string
          dest_lat: number
          dest_lng: number
          id: string
          images: string[]
          likes_count: number
          rating_count: number
          rating_sum: number
          route_distance_m: number
          route_duration_s: number
          route_polyline: string | null
          saves_count: number
          start_label: string
          start_lat: number
          start_lng: number
          stops: Json
          tags: string[]
          tips: string | null
          title: string
        }
        Insert: {
          comments_count?: number
          created_at?: string
          creator_avatar?: string | null
          creator_id: string
          creator_name: string
          description?: string | null
          dest_label: string
          dest_lat: number
          dest_lng: number
          id?: string
          images?: string[]
          likes_count?: number
          rating_count?: number
          rating_sum?: number
          route_distance_m?: number
          route_duration_s?: number
          route_polyline?: string | null
          saves_count?: number
          start_label: string
          start_lat: number
          start_lng: number
          stops?: Json
          tags?: string[]
          tips?: string | null
          title: string
        }
        Update: {
          comments_count?: number
          created_at?: string
          creator_avatar?: string | null
          creator_id?: string
          creator_name?: string
          description?: string | null
          dest_label?: string
          dest_lat?: number
          dest_lng?: number
          id?: string
          images?: string[]
          likes_count?: number
          rating_count?: number
          rating_sum?: number
          route_distance_m?: number
          route_duration_s?: number
          route_polyline?: string | null
          saves_count?: number
          start_label?: string
          start_lat?: number
          start_lng?: number
          stops?: Json
          tags?: string[]
          tips?: string | null
          title?: string
        }
        Relationships: []
      }
      sos_alerts: {
        Row: {
          alert_type: Database["public"]["Enums"]["alert_type"]
          created_at: string
          id: string
          lat: number
          lng: number
          message: string | null
          status: Database["public"]["Enums"]["alert_status"]
          tourist_id: string
          tourist_name: string
          tourist_phone: string | null
        }
        Insert: {
          alert_type?: Database["public"]["Enums"]["alert_type"]
          created_at?: string
          id?: string
          lat: number
          lng: number
          message?: string | null
          status?: Database["public"]["Enums"]["alert_status"]
          tourist_id: string
          tourist_name: string
          tourist_phone?: string | null
        }
        Update: {
          alert_type?: Database["public"]["Enums"]["alert_type"]
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          message?: string | null
          status?: Database["public"]["Enums"]["alert_status"]
          tourist_id?: string
          tourist_name?: string
          tourist_phone?: string | null
        }
        Relationships: []
      }
      tour_group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tour_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_groups: {
        Row: {
          cover_image: string | null
          created_at: string
          creator_id: string
          description: string | null
          group_code: string
          id: string
          images: string[]
          invite_code: string
          is_live: boolean
          live_started_at: string | null
          name: string
          route_distance_m: number
          route_duration_s: number
          route_polyline: string | null
          source_shared_tour_id: string | null
          tags: string[]
          tips: string | null
          waypoints: Json
        }
        Insert: {
          cover_image?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          group_code?: string
          id?: string
          images?: string[]
          invite_code?: string
          is_live?: boolean
          live_started_at?: string | null
          name: string
          route_distance_m?: number
          route_duration_s?: number
          route_polyline?: string | null
          source_shared_tour_id?: string | null
          tags?: string[]
          tips?: string | null
          waypoints?: Json
        }
        Update: {
          cover_image?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          group_code?: string
          id?: string
          images?: string[]
          invite_code?: string
          is_live?: boolean
          live_started_at?: string | null
          name?: string
          route_distance_m?: number
          route_duration_s?: number
          route_polyline?: string | null
          source_shared_tour_id?: string | null
          tags?: string[]
          tips?: string | null
          waypoints?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          coordinates: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          zone_type: Database["public"]["Enums"]["zone_type"]
        }
        Insert: {
          coordinates: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          zone_type: Database["public"]["Enums"]["zone_type"]
        }
        Update: {
          coordinates?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          zone_type?: Database["public"]["Enums"]["zone_type"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_group_id_by_code: { Args: { _code: string }; Returns: string }
      get_group_preview: {
        Args: { _group_id: string }
        Returns: {
          cover_image: string
          creator_id: string
          creator_name: string
          description: string
          group_code: string
          id: string
          images: string[]
          member_count: number
          name: string
          route_distance_m: number
          route_duration_s: number
          tags: string[]
          waypoints: Json
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      alert_status: "critical" | "warning" | "resolved"
      alert_type: "sos" | "zone_entry"
      app_role: "tourist" | "department"
      report_status: "active" | "found"
      zone_type: "safe" | "caution" | "danger"
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
  public: {
    Enums: {
      alert_status: ["critical", "warning", "resolved"],
      alert_type: ["sos", "zone_entry"],
      app_role: ["tourist", "department"],
      report_status: ["active", "found"],
      zone_type: ["safe", "caution", "danger"],
    },
  },
} as const
