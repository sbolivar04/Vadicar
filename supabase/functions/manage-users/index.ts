import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Manejar preflight request de CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        )

        const { action, email, password, username } = await req.json()

        if (action === 'list_users') {
            const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
            if (listError) throw listError

            const emails = users.map(u => u.email)
            return new Response(JSON.stringify({ emails }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (!email) throw new Error('Email is required')

        if (action === 'upsert_user') {
            // 1. Verificar si el usuario ya existe en auth.users
            const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
            if (listError) throw listError

            const existingUser = users.find(u => u.email === email)

            if (existingUser) {
                // Actualizar contraseña si se proporcionó una
                if (password) {
                    try {
                        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
                            existingUser.id,
                            { password: password }
                        )
                        if (updateError) throw updateError
                    } catch (err) {
                        // Si el error es que la contraseña es la misma, lo ignoramos y seguimos
                        // Mensajes típicos: "New password should be different from the old password" o similar
                        const msg = err.message || '';
                        if (!msg.includes('different') && !msg.includes('same')) {
                            throw err;
                        }
                    }
                }
                return new Response(JSON.stringify({ message: 'User updated successfully', user: existingUser }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            } else {
                // Crear nuevo usuario
                if (!password) throw new Error('Password is required for new users')
                const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: { username }
                })
                if (createError) throw createError
                return new Response(JSON.stringify({ message: 'User created successfully', user }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }
        }

        if (action === 'delete_user') {
            const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
            const userToDelete = users.find(u => u.email === email)
            if (userToDelete) {
                const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userToDelete.id)
                if (deleteError) throw deleteError
            }
            return new Response(JSON.stringify({ message: 'User deleted successfully' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        throw new Error('Invalid action')

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
