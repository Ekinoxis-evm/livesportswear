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
      ad_insights: {
        Row: {
          campaign_id: string
          campaign_name: string | null
          clicks: number
          currency: string | null
          date: string
          id: string
          impressions: number
          purchases: number
          revenue: number
          spend: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          campaign_name?: string | null
          clicks?: number
          currency?: string | null
          date: string
          id?: string
          impressions?: number
          purchases?: number
          revenue?: number
          spend?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number
          currency?: string | null
          date?: string
          id?: string
          impressions?: number
          purchases?: number
          revenue?: number
          spend?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_locations: {
        Row: {
          admin_user_id: string
          created_at: string
          location_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          location_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: number
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: number
        }
        Relationships: []
      }
      client_events: {
        Row: {
          attended_at: string
          business_date: string
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          employee_id: string
          got_contact: boolean
          id: string
          kind: string
          linked_orders: Json | null
          location_id: string
          note: string | null
          order_total: number | null
          products: Json | null
          reasons: string[] | null
          return_type: string | null
          shopify_customer_id: string | null
          shopify_order_id: string | null
          shopify_order_name: string | null
          sold: boolean
        }
        Insert: {
          attended_at?: string
          business_date: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          employee_id: string
          got_contact?: boolean
          id?: string
          kind?: string
          linked_orders?: Json | null
          location_id: string
          note?: string | null
          order_total?: number | null
          products?: Json | null
          reasons?: string[] | null
          return_type?: string | null
          shopify_customer_id?: string | null
          shopify_order_id?: string | null
          shopify_order_name?: string | null
          sold?: boolean
        }
        Update: {
          attended_at?: string
          business_date?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          employee_id?: string
          got_contact?: boolean
          id?: string
          kind?: string
          linked_orders?: Json | null
          location_id?: string
          note?: string | null
          order_total?: number | null
          products?: Json | null
          reasons?: string[] | null
          return_type?: string | null
          shopify_customer_id?: string | null
          shopify_order_id?: string | null
          shopify_order_name?: string | null
          sold?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_config: {
        Row: {
          biweekly_hour_cap: number
          currency: string
          id: number
          sprint_anchor_monday: string
          tiers: Json
          updated_at: string
        }
        Insert: {
          biweekly_hour_cap?: number
          currency?: string
          id?: number
          sprint_anchor_monday?: string
          tiers?: Json
          updated_at?: string
        }
        Update: {
          biweekly_hour_cap?: number
          currency?: string
          id?: number
          sprint_anchor_monday?: string
          tiers?: Json
          updated_at?: string
        }
        Relationships: []
      }
      customer_origin: {
        Row: {
          country_iso: string | null
          created_at: string
          customer_name: string | null
          first_order_at: string
          first_order_id: string
          first_order_name: string | null
          location_id: string
          orders_count: number | null
          shopify_customer_id: string
          staff_id: string | null
          stats_synced_at: string | null
          total_spent: number | null
          updated_at: string
        }
        Insert: {
          country_iso?: string | null
          created_at?: string
          customer_name?: string | null
          first_order_at: string
          first_order_id: string
          first_order_name?: string | null
          location_id: string
          orders_count?: number | null
          shopify_customer_id: string
          staff_id?: string | null
          stats_synced_at?: string | null
          total_spent?: number | null
          updated_at?: string
        }
        Update: {
          country_iso?: string | null
          created_at?: string
          customer_name?: string | null
          first_order_at?: string
          first_order_id?: string
          first_order_name?: string | null
          location_id?: string
          orders_count?: number | null
          shopify_customer_id?: string
          staff_id?: string | null
          stats_synced_at?: string | null
          total_spent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_origin_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_compensation: {
        Row: {
          created_at: string
          employee_id: string
          hourly_rate: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          hourly_rate?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          hourly_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_compensation_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_credentials: {
        Row: {
          employee_id: string
          set_at: string
          set_by: string | null
          temp_password: string
        }
        Insert: {
          employee_id: string
          set_at?: string
          set_by?: string | null
          temp_password: string
        }
        Update: {
          employee_id?: string
          set_at?: string
          set_by?: string | null
          temp_password?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_credentials_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_goals: {
        Row: {
          created_at: string
          employee_id: string
          goal_amount: number
          month: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          goal_amount?: number
          month: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          goal_amount?: number
          month?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_goals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          auth_user_id: string | null
          avatar_color: string | null
          avatar_url: string | null
          created_at: string
          email: string
          hire_date: string | null
          id: string
          kiosk_pin_hash: string | null
          location_id: string
          magic_token: string
          max_days_per_week: number
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["employee_role"]
          shopify_staff_id: string | null
          updated_at: string
          weekly_days_off: number
          weekly_hour_target: number
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          avatar_color?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          hire_date?: string | null
          id?: string
          kiosk_pin_hash?: string | null
          location_id: string
          magic_token: string
          max_days_per_week?: number
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["employee_role"]
          shopify_staff_id?: string | null
          updated_at?: string
          weekly_days_off?: number
          weekly_hour_target?: number
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          avatar_color?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          hire_date?: string | null
          id?: string
          kiosk_pin_hash?: string | null
          location_id?: string
          magic_token?: string
          max_days_per_week?: number
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["employee_role"]
          shopify_staff_id?: string | null
          updated_at?: string
          weekly_days_off?: number
          weekly_hour_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_breaks: {
        Row: {
          business_date: string
          created_at: string
          employee_id: string
          ended_at: string | null
          id: string
          location_id: string
          started_at: string
        }
        Insert: {
          business_date: string
          created_at?: string
          employee_id: string
          ended_at?: string | null
          id?: string
          location_id: string
          started_at?: string
        }
        Update: {
          business_date?: string
          created_at?: string
          employee_id?: string
          ended_at?: string | null
          id?: string
          location_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_breaks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_breaks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_checkins: {
        Row: {
          arrived_at: string
          attending_count: number
          attending_return_count: number
          available_since: string | null
          bumped_at: string | null
          business_date: string
          created_at: string
          employee_id: string
          entry_photo_path: string | null
          entry_self: boolean
          entry_validated_at: string | null
          entry_validated_by: string | null
          exit_missed: boolean
          exit_photo_path: string | null
          exit_self: boolean
          exit_validated_at: string | null
          exit_validated_by: string | null
          id: string
          left_at: string | null
          location_id: string
          manual_pos: number | null
          rotation_count: number
          status: string
        }
        Insert: {
          arrived_at?: string
          attending_count?: number
          attending_return_count?: number
          available_since?: string | null
          bumped_at?: string | null
          business_date: string
          created_at?: string
          employee_id: string
          entry_photo_path?: string | null
          entry_self?: boolean
          entry_validated_at?: string | null
          entry_validated_by?: string | null
          exit_missed?: boolean
          exit_photo_path?: string | null
          exit_self?: boolean
          exit_validated_at?: string | null
          exit_validated_by?: string | null
          id?: string
          left_at?: string | null
          location_id: string
          manual_pos?: number | null
          rotation_count?: number
          status?: string
        }
        Update: {
          arrived_at?: string
          attending_count?: number
          attending_return_count?: number
          available_since?: string | null
          bumped_at?: string | null
          business_date?: string
          created_at?: string
          employee_id?: string
          entry_photo_path?: string | null
          entry_self?: boolean
          entry_validated_at?: string | null
          entry_validated_by?: string | null
          exit_missed?: boolean
          exit_photo_path?: string | null
          exit_self?: boolean
          exit_validated_at?: string | null
          exit_validated_by?: string | null
          id?: string
          left_at?: string | null
          location_id?: string
          manual_pos?: number | null
          rotation_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_checkins_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_checkins_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_days: {
        Row: {
          business_date: string
          closed_at: string | null
          closed_by: string | null
          location_id: string
          opened_at: string
          opened_by: string | null
        }
        Insert: {
          business_date: string
          closed_at?: string | null
          closed_by?: string | null
          location_id: string
          opened_at?: string
          opened_by?: string | null
        }
        Update: {
          business_date?: string
          closed_at?: string | null
          closed_by?: string | null
          location_id?: string
          opened_at?: string
          opened_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "floor_days_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          barcode: string
          count_id: string
          created_at: string
          doc_qty: number | null
          expected: number | null
          id: string
          product_title: string
          product_type: string | null
          qty: number
          sku: string | null
          unknown: boolean
          updated_at: string
          variant_title: string | null
        }
        Insert: {
          barcode: string
          count_id: string
          created_at?: string
          doc_qty?: number | null
          expected?: number | null
          id?: string
          product_title: string
          product_type?: string | null
          qty?: number
          sku?: string | null
          unknown?: boolean
          updated_at?: string
          variant_title?: string | null
        }
        Update: {
          barcode?: string
          count_id?: string
          created_at?: string
          doc_qty?: number | null
          expected?: number | null
          id?: string
          product_title?: string
          product_type?: string | null
          qty?: number
          sku?: string | null
          unknown?: boolean
          updated_at?: string
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          counted_units: number | null
          created_at: string
          document_path: string | null
          expected_units: number | null
          finalized_at: string | null
          id: string
          kind: string
          location_id: string
          note: string | null
          started_at: string
          started_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          counted_units?: number | null
          created_at?: string
          document_path?: string | null
          expected_units?: number | null
          finalized_at?: string | null
          id?: string
          kind?: string
          location_id: string
          note?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          counted_units?: number | null
          created_at?: string
          document_path?: string | null
          expected_units?: number | null
          finalized_at?: string | null
          id?: string
          kind?: string
          location_id?: string
          note?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          color: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          postal_code: string | null
          share_token: string | null
          slug: string
          state: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          color?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name: string
          postal_code?: string | null
          share_token?: string | null
          slug: string
          state?: string | null
          timezone: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          color?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          postal_code?: string | null
          share_token?: string | null
          slug?: string
          state?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body: string
          key: string
          language: string
          location_id: string
          updated_at: string
        }
        Insert: {
          body: string
          key?: string
          language: string
          location_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          key?: string
          language?: string
          location_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_sales: {
        Row: {
          amount: number
          created_at: string
          discounts_amount: number | null
          employee_id: string
          gross_amount: number | null
          id: string
          month: string
          returns_amount: number | null
          source: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          discounts_amount?: number | null
          employee_id: string
          gross_amount?: number | null
          id?: string
          month: string
          returns_amount?: number | null
          source?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          discounts_amount?: number | null
          employee_id?: string
          gross_amount?: number | null
          id?: string
          month?: string
          returns_amount?: number | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_sales_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_contests: {
        Row: {
          created_at: string
          end_date: string
          goal_source: string
          personal_source: string
          id: string
          location_id: string
          name: string
          personal_goals: Json
          prizes: Json
          results: Json | null
          start_date: string
          store_threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          goal_source?: string
          personal_source?: string
          id?: string
          location_id: string
          name: string
          personal_goals?: Json
          prizes?: Json
          results?: Json | null
          start_date: string
          store_threshold?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          goal_source?: string
          personal_source?: string
          id?: string
          location_id?: string
          name?: string
          personal_goals?: Json
          prizes?: Json
          results?: Json | null
          start_date?: string
          store_threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_contests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          id: string
          location_id: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["schedule_status"]
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_templates: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          default_headcount: number
          end_time: string
          id: string
          location_id: string
          name: string
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          default_headcount?: number
          end_time: string
          id?: string
          location_id: string
          name: string
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          default_headcount?: number
          end_time?: string
          id?: string
          location_id?: string
          name?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_at: string
          date: string
          employee_id: string
          end_time: string
          id: string
          notes: string | null
          schedule_id: string
          shift_template_id: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          employee_id: string
          end_time: string
          id?: string
          notes?: string | null
          schedule_id: string
          shift_template_id?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          employee_id?: string
          end_time?: string
          id?: string
          notes?: string | null
          schedule_id?: string
          shift_template_id?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_shift_template_id_fkey"
            columns: ["shift_template_id"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_push_drafts: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          book_items: number
          created_at: string
          created_by: string | null
          discarded_at: string | null
          id: string
          in_sync_items: number
          location_id: string
          shopify_location_id: string
          shopify_location_name: string | null
          skipped_no_variant: number
          skipped_unknown: number
          status: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          book_items?: number
          created_at?: string
          created_by?: string | null
          discarded_at?: string | null
          id?: string
          in_sync_items?: number
          location_id: string
          shopify_location_id: string
          shopify_location_name?: string | null
          skipped_no_variant?: number
          skipped_unknown?: number
          status?: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          book_items?: number
          created_at?: string
          created_by?: string | null
          discarded_at?: string | null
          id?: string
          in_sync_items?: number
          location_id?: string
          shopify_location_id?: string
          shopify_location_name?: string | null
          skipped_no_variant?: number
          skipped_unknown?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_push_drafts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_push_draft_items: {
        Row: {
          apply_error: string | null
          apply_status: string | null
          barcode: string
          book_qty: number
          created_at: string
          delta: number
          draft_id: string
          excluded: boolean
          id: string
          inventory_item_id: string
          product_title: string
          shopify_qty: number
          sku: string | null
          updated_at: string
          variant_title: string | null
        }
        Insert: {
          apply_error?: string | null
          apply_status?: string | null
          barcode: string
          book_qty: number
          created_at?: string
          delta: number
          draft_id: string
          excluded?: boolean
          id?: string
          inventory_item_id: string
          product_title: string
          shopify_qty: number
          sku?: string | null
          updated_at?: string
          variant_title?: string | null
        }
        Update: {
          apply_error?: string | null
          apply_status?: string | null
          barcode?: string
          book_qty?: number
          created_at?: string
          delta?: number
          draft_id?: string
          excluded?: boolean
          id?: string
          inventory_item_id?: string
          product_title?: string
          shopify_qty?: number
          sku?: string | null
          updated_at?: string
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_push_draft_items_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "shopify_push_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      store_inventory: {
        Row: {
          barcode: string
          count_id: string | null
          counted_at: string
          created_at: string
          id: string
          location_id: string
          product_title: string
          product_type: string | null
          qty: number
          shopify_qty: number | null
          sku: string | null
          unknown: boolean
          updated_at: string
          variant_title: string | null
        }
        Insert: {
          barcode: string
          count_id?: string | null
          counted_at?: string
          created_at?: string
          id?: string
          location_id: string
          product_title: string
          product_type?: string | null
          qty?: number
          shopify_qty?: number | null
          sku?: string | null
          unknown?: boolean
          updated_at?: string
          variant_title?: string | null
        }
        Update: {
          barcode?: string
          count_id?: string | null
          counted_at?: string
          created_at?: string
          id?: string
          location_id?: string
          product_title?: string
          product_type?: string | null
          qty?: number
          shopify_qty?: number | null
          sku?: string | null
          unknown?: boolean
          updated_at?: string
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_inventory_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_day_closes: {
        Row: {
          attended_count: number
          business_date: string
          cash_sales: number | null
          closed_at: string
          closed_by: string | null
          contact_count: number
          created_at: string
          currency: string | null
          discounts: number | null
          gross_sales: number | null
          id: string
          location_id: string
          returns_value: number | null
          shopify_sales: number | null
          sold_count: number
        }
        Insert: {
          attended_count?: number
          business_date: string
          cash_sales?: number | null
          closed_at?: string
          closed_by?: string | null
          contact_count?: number
          created_at?: string
          currency?: string | null
          discounts?: number | null
          gross_sales?: number | null
          id?: string
          location_id: string
          returns_value?: number | null
          shopify_sales?: number | null
          sold_count?: number
        }
        Update: {
          attended_count?: number
          business_date?: string
          cash_sales?: number | null
          closed_at?: string
          closed_by?: string | null
          contact_count?: number
          created_at?: string
          currency?: string | null
          discounts?: number | null
          gross_sales?: number | null
          id?: string
          location_id?: string
          returns_value?: number | null
          shopify_sales?: number | null
          sold_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_day_closes_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_day_closes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_goals: {
        Row: {
          created_at: string
          currency: string | null
          goal_amount: number
          location_id: string
          month: number
          tiers: Json | null
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          currency?: string | null
          goal_amount?: number
          location_id: string
          month: number
          tiers?: Json | null
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          currency?: string | null
          goal_amount?: number
          location_id?: string
          month?: number
          tiers?: Json | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_goals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_report_recipients: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          location_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          location_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_report_recipients_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_requests: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          decided_note: string | null
          employee_id: string
          end_date: string
          id: string
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["time_off_status"]
          submitted_at: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          decided_note?: string | null
          employee_id: string
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["time_off_status"]
          submitted_at?: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          decided_note?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["time_off_status"]
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_employee_id: { Args: never; Returns: string }
      current_location_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      update_customer_stats: { Args: { rows: Json }; Returns: undefined }
      upsert_customer_origin: { Args: { rows: Json }; Returns: undefined }
      client_origin_tallies: {
        Args: never
        Returns: { staff_id: string | null; country_iso: string | null; clients: number }[]
      }
    }
    Enums: {
      employee_role: "sales_rep" | "shift_lead" | "store_manager"
      schedule_status: "draft" | "published"
      time_off_status: "pending" | "approved" | "rejected"
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
      employee_role: ["sales_rep", "shift_lead", "store_manager"],
      schedule_status: ["draft", "published"],
      time_off_status: ["pending", "approved", "rejected"],
    },
  },
} as const
