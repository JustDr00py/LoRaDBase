use loradb::security::api_token::ApiTokenStore;
use std::env;
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();

    if args.len() < 3 {
        eprintln!("Usage: {} <data_dir> <username> [name] [expires_in_days]", args[0]);
        eprintln!("\nArguments:");
        eprintln!("  data_dir          - Directory where api_tokens.json will be stored");
        eprintln!("  username          - Username associated with the token");
        eprintln!("  name              - Optional: Human-readable token name (default: 'CLI Generated Token')");
        eprintln!("  expires_in_days   - Optional: Token expiration in days (default: never expires)");
        eprintln!("\nExamples:");
        eprintln!("  {} /var/lib/loradb/data admin", args[0]);
        eprintln!("  {} /var/lib/loradb/data admin 'Production API' 365", args[0]);
        std::process::exit(1);
    }

    let data_dir = PathBuf::from(&args[1]);
    let username = &args[2];

    // Optional token name
    let name = if args.len() >= 4 {
        args[3].clone()
    } else {
        "CLI Generated Token".to_string()
    };

    // Optional expiration
    let expires_in_days: Option<i64> = if args.len() >= 5 {
        Some(args[4].parse()
            .expect("expires_in_days must be a valid integer"))
    } else {
        None
    };

    // Construct storage path
    let storage_path = data_dir.join("api_tokens.json");

    // Create token store
    let token_store = ApiTokenStore::new(&storage_path)?;

    // Generate token
    let (token, api_token) = token_store.create_token(
        name.clone(),
        username.to_string(),
        expires_in_days,
    )?;

    // Output results
    println!("\n✓ API Token generated successfully!\n");
    println!("Token ID:     {}", api_token.id);
    println!("Name:         {}", api_token.name);
    println!("Created by:   {}", api_token.created_by);
    println!("Created at:   {}", api_token.created_at.format("%Y-%m-%d %H:%M:%S UTC"));

    if let Some(expires_at) = api_token.expires_at {
        println!("Expires at:   {}", expires_at.format("%Y-%m-%d %H:%M:%S UTC"));
    } else {
        println!("Expires at:   Never");
    }

    println!("\n{}", "=".repeat(70));
    println!("API TOKEN (save this, it won't be shown again):");
    println!("{}", "=".repeat(70));
    println!("\n{}\n", token);
    println!("{}", "=".repeat(70));

    println!("\nUse this token in API requests:");
    println!("  curl -H 'Authorization: Bearer {}' https://your-domain.com/devices", token);

    println!("\nToken stored in: {}", storage_path.display());

    Ok(())
}
